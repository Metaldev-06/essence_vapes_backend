import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { Observable, Subject } from 'rxjs';
import { Brackets, In, IsNull, MoreThanOrEqual, Not, Repository, SelectQueryBuilder } from 'typeorm';

import { Role } from '../../common/enums/system-role.enum';
import { LoggerHelper } from '../../common/helpers/logger.helper';
import { User } from '../auth/entities/user.entity';
import type { BulkNotificationAction } from './dto/bulk-notifications.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { DeliveryChannel, DeliveryStatus } from './enums/notification.enums';
import { isUniqueViolation } from './helpers/db-error.helper';
import { sanitizeBody, sanitizeErrorMessage, sanitizeTitle } from './helpers/notification-text.helper';
import { isWithinQuietHours } from './helpers/quiet-hours.helper';
import { toNotificationResponse } from './mappers/notification-response.mapper';
import { NOTIFICATION_CATALOG, SPAM_WINDOW_MS, isCritical, resolveChannels } from './notification-catalog';
import type { NotificationEvent } from './notification-events';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';

const QUIET_HOURS_REASON = 'Horario de silencio';

/**
 * Núcleo del sistema de notificaciones administrativas.
 *
 * `publish()` es el ÚNICO punto de entrada para crear una notificación y tiene dos garantías
 * que el resto del backend puede asumir sin pensarlo:
 *  1. Nunca lanza. Un fallo acá se loguea y se traga - jamás tira abajo un pago, un webhook o
 *     un ajuste de stock que lo haya disparado.
 *  2. Es idempotente por `dedupeKey`. Llamarlo N veces con el mismo evento deja una sola
 *     notificación por admin (índice único en la base, no un chequeo en memoria).
 *
 * Toda lectura/escritura del feed filtra por `recipientId` - no existe ningún método que opere
 * sobre una notificación solo por su id.
 */
@Injectable()
export class NotificationsService {
  private readonly deliveriesQueued = new Subject<void>();

  /** Emite cuando hay entregas nuevas por procesar - `NotificationDeliveryWorker` lo escucha
   *  para enviarlas enseguida en vez de esperar a su intervalo. */
  readonly deliveriesQueued$: Observable<void> = this.deliveriesQueued.asObservable();

  constructor(
    @InjectRepository(AdminNotification)
    private readonly notificationsRepository: Repository<AdminNotification>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveriesRepository: Repository<NotificationDelivery>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(PushSubscription)
    private readonly pushSubscriptionsRepository: Repository<PushSubscription>,
    private readonly settingsService: NotificationSettingsService,
    private readonly realtime: NotificationsRealtimeService,
    private readonly configService: ConfigService,
  ) {}

  /** Devuelve las notificaciones efectivamente creadas (vacío si era un duplicado, si nadie
   *  tiene el evento habilitado, o si algo falló). */
  async publish(event: NotificationEvent): Promise<AdminNotification[]> {
    try {
      return await this.doPublish(event);
    } catch (error) {
      LoggerHelper(
        `No se pudo publicar la notificación "${event.type}" (${event.dedupeKey}): ${sanitizeErrorMessage(error)}`,
        'NotificationsService',
        true,
      );
      return [];
    }
  }

  private async doPublish(event: NotificationEvent): Promise<AdminNotification[]> {
    const definition = NOTIFICATION_CATALOG[event.type];
    const admins = await this.usersRepository.find({
      where: {
        role: Role.ADMIN,
        isActive: true,
        ...(event.excludeAdminId ? { id: Not(event.excludeAdminId) } : {}),
      },
      select: { id: true },
    });
    if (admins.length === 0) return [];

    const adminIds = admins.map((admin) => admin.id);
    const [preferences, adminSettings, pushOwners] = await Promise.all([
      this.settingsService.getPreferencesFor(adminIds, event.type),
      this.settingsService.getAdminSettingsFor(adminIds),
      this.findAdminsWithPushSubscription(adminIds),
    ]);

    const now = new Date();
    const pushEnabled = Boolean(this.configService.get<boolean>('notifications.pushEnabled'));
    const critical = isCritical(event.type);
    const created: AdminNotification[] = [];

    for (const adminId of adminIds) {
      const channels = resolveChannels(event.type, preferences.get(adminId));
      if (!channels.inApp && !channels.push && !channels.email) continue;

      if (await this.isRateLimited(adminId, event, definition.maxPerWindow, now)) continue;

      const quiet = !critical && isWithinQuietHours(adminSettings.get(adminId), now);
      const deliveryChannels: DeliveryChannel[] = [];
      if (channels.push && pushEnabled && pushOwners.has(adminId)) deliveryChannels.push(DeliveryChannel.PUSH);
      if (channels.email) deliveryChannels.push(DeliveryChannel.EMAIL);

      const notification = await this.insertOnce(adminId, event, channels.inApp, deliveryChannels, quiet, now);
      if (!notification) continue;

      created.push(notification);
      if (notification.inApp) {
        this.realtime.emit(adminId, {
          type: 'notification.created',
          notification: toNotificationResponse(notification),
          unreadCount: await this.countUnread(adminId),
        });
      }
    }

    return created;
  }

  /**
   * Inserta la notificación y deja encoladas sus entregas externas. Devuelve `null` si ya existía
   * (mismo `dedupeKey` para ese admin): el chequeo previo ahorra el intento en el caso común y el
   * índice único cubre la carrera entre dos publicaciones simultáneas.
   *
   * A propósito NO abre una transacción explícita: el SQLite de desarrollo tiene una sola
   * conexión, y un `BEGIN` propio podría chocar con la transacción de un checkout en curso
   * ("cannot start a transaction within a transaction") - algo que este módulo no puede
   * permitirse provocar. La atomicidad se logra de otra forma: la intención de entrega viaja
   * DENTRO de la fila de la notificación (`deliveryChannels`, una sola sentencia atómica), y si
   * el proceso muriera justo antes de insertar las filas de entrega, `NotificationDeliveryWorker`
   * las reconstruye a partir de esa columna. Mismo resultado que un outbox transaccional, sin
   * competir por la conexión.
   */
  private async insertOnce(
    recipientId: string,
    event: NotificationEvent,
    inApp: boolean,
    deliveryChannels: DeliveryChannel[],
    quiet: boolean,
    now: Date,
  ): Promise<AdminNotification | null> {
    const duplicate = await this.notificationsRepository.findOne({
      where: { recipientId, dedupeKey: event.dedupeKey },
      select: { id: true },
    });
    if (duplicate) return null;

    const definition = NOTIFICATION_CATALOG[event.type];
    let notification: AdminNotification;
    try {
      notification = await this.notificationsRepository.save(
        this.notificationsRepository.create({
          recipientId,
          type: event.type,
          category: definition.category,
          priority: definition.priority,
          title: sanitizeTitle(event.title),
          body: sanitizeBody(event.body),
          resourceUrl: event.resourceUrl?.startsWith('/admin') ? event.resourceUrl : null,
          resourceType: event.resourceType ?? null,
          resourceId: event.resourceId ?? null,
          metadata: event.metadata ?? null,
          dedupeKey: event.dedupeKey,
          inApp,
          // En horario de silencio lo no crítico no se entrega por canales externos (se ve igual
          // en el panel y entra en el resumen) - por eso no queda intención que reconstruir.
          deliveryChannels: !quiet && deliveryChannels.length > 0 ? deliveryChannels : null,
          readAt: null,
          archivedAt: null,
          createdAt: now,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }

    if (deliveryChannels.length > 0) {
      try {
        await this.enqueueDeliveries(notification, deliveryChannels, quiet ? QUIET_HOURS_REASON : null);
      } catch (error) {
        // La notificación ya existe y se ve en el panel; el worker reintenta encolar las entregas.
        LoggerHelper(
          `No se pudieron encolar las entregas de la notificación ${notification.id}: ${sanitizeErrorMessage(error)}`,
          'NotificationsService',
          true,
        );
      }
    }

    return notification;
  }

  /** Idempotente por el índice único `(notificationId, channel)` - lo usan `publish` y la
   *  reparación del worker. `skippedReason` deja la entrega registrada como omitida a propósito. */
  async enqueueDeliveries(
    notification: Pick<AdminNotification, 'id' | 'recipientId'>,
    channels: DeliveryChannel[],
    skippedReason: string | null = null,
  ): Promise<void> {
    const now = new Date();
    for (const channel of channels) {
      try {
        await this.deliveriesRepository.insert({
          notificationId: notification.id,
          recipientId: notification.recipientId,
          channel,
          status: skippedReason ? DeliveryStatus.SKIPPED : DeliveryStatus.PENDING,
          attempts: 0,
          nextAttemptAt: skippedReason ? null : now,
          lastError: skippedReason,
          sentAt: null,
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!skippedReason && channels.length > 0) this.deliveriesQueued.next();
  }

  /** Freno antispam por admin+tipo: si algo entra en loop, el panel no se inunda. */
  private async isRateLimited(
    recipientId: string,
    event: NotificationEvent,
    maxPerWindow: number,
    now: Date,
  ): Promise<boolean> {
    const recent = await this.notificationsRepository.count({
      where: {
        recipientId,
        type: event.type,
        createdAt: MoreThanOrEqual(new Date(now.getTime() - SPAM_WINDOW_MS)),
      },
    });
    if (recent < maxPerWindow) return false;

    LoggerHelper(
      `Notificación "${event.type}" descartada por límite antispam (${maxPerWindow} cada ${SPAM_WINDOW_MS / 60_000} min)`,
      'NotificationsService',
    );
    return true;
  }

  private async findAdminsWithPushSubscription(adminIds: string[]): Promise<Set<string>> {
    const rows = await this.pushSubscriptionsRepository.find({
      where: { adminId: In(adminIds) },
      select: { adminId: true },
    });
    return new Set(rows.map((row) => row.adminId));
  }

  // ---------------------------------------------------------------------------------------------
  // Feed del panel - todo acotado al admin autenticado
  // ---------------------------------------------------------------------------------------------

  async findForAdmin(recipientId: string, query: QueryNotificationsDto) {
    const { limit = 20, offset = 0 } = query;

    const qb = this.notificationsRepository.createQueryBuilder('n');
    this.applyFeedFilters(qb, recipientId, query);

    const [[rows, total], unreadCount] = await Promise.all([
      qb.orderBy('n.createdAt', 'DESC').addOrderBy('n.id', 'DESC').skip(offset).take(limit).getManyAndCount(),
      this.countUnread(recipientId),
    ]);

    return {
      data: rows.map(toNotificationResponse),
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: Math.floor(offset / limit) + 1,
        limit,
        offset,
      },
      unreadCount,
    };
  }

  private applyFeedFilters(
    qb: SelectQueryBuilder<AdminNotification>,
    recipientId: string,
    query: QueryNotificationsDto,
  ): void {
    qb.where('n.recipientId = :recipientId', { recipientId }).andWhere('n.inApp = :inApp', { inApp: true });

    switch (query.status ?? 'active') {
      case 'archived':
        qb.andWhere('n.archivedAt IS NOT NULL');
        break;
      case 'unread':
        qb.andWhere('n.archivedAt IS NULL').andWhere('n.readAt IS NULL');
        break;
      case 'read':
        qb.andWhere('n.archivedAt IS NULL').andWhere('n.readAt IS NOT NULL');
        break;
      default:
        qb.andWhere('n.archivedAt IS NULL');
    }

    if (query.category) qb.andWhere('n.category = :category', { category: query.category });
    if (query.type) qb.andWhere('n.type = :type', { type: query.type });
    if (query.priority) qb.andWhere('n.priority = :priority', { priority: query.priority });
    if (query.dateFrom) qb.andWhere('n.createdAt >= :dateFrom', { dateFrom: new Date(query.dateFrom) });
    if (query.dateTo) qb.andWhere('n.createdAt <= :dateTo', { dateTo: new Date(query.dateTo) });
    if (query.since) qb.andWhere('n.createdAt >= :since', { since: new Date(query.since) });

    const search = query.search?.trim().toLowerCase();
    if (search) {
      // `%`/`_` del usuario se escapan: se buscan como texto literal, no como comodines de LIKE.
      const needle = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where("LOWER(n.title) LIKE :needle ESCAPE '\\'", { needle })
            .orWhere("LOWER(n.body) LIKE :needle ESCAPE '\\'", { needle });
        }),
      );
    }
  }

  countUnread(recipientId: string): Promise<number> {
    return this.notificationsRepository.count({
      where: { recipientId, inApp: true, readAt: IsNull(), archivedAt: IsNull() },
    });
  }

  async setRead(recipientId: string, id: string, read: boolean) {
    const notification = await this.findOwnedOrThrow(recipientId, id);
    notification.readAt = read ? (notification.readAt ?? new Date()) : null;
    const saved = await this.notificationsRepository.save(notification);
    await this.emitChanged(recipientId);
    return toNotificationResponse(saved);
  }

  async setArchived(recipientId: string, id: string, archived: boolean) {
    const notification = await this.findOwnedOrThrow(recipientId, id);
    notification.archivedAt = archived ? (notification.archivedAt ?? new Date()) : null;
    // Archivar algo sin leer lo da por visto - si no, quedaría contando como "sin leer" en un
    // lugar donde ya no se ve.
    if (archived && !notification.readAt) notification.readAt = new Date();
    const saved = await this.notificationsRepository.save(notification);
    await this.emitChanged(recipientId);
    return toNotificationResponse(saved);
  }

  async markAllRead(recipientId: string): Promise<{ updated: number; unreadCount: number }> {
    const result = await this.notificationsRepository.update(
      { recipientId, inApp: true, readAt: IsNull(), archivedAt: IsNull() },
      { readAt: new Date() },
    );
    await this.emitChanged(recipientId);
    return { updated: result.affected ?? 0, unreadCount: 0 };
  }

  /** `recipientId` va en el WHERE de la propia sentencia: ids de otro admin simplemente no
   *  matchean (0 filas afectadas), nunca se tocan. */
  async bulk(
    recipientId: string,
    ids: string[],
    action: BulkNotificationAction,
  ): Promise<{ updated: number; unreadCount: number }> {
    const where = { recipientId, id: In(ids) };
    const now = new Date();
    let affected = 0;

    switch (action) {
      case 'read':
        affected =
          (await this.notificationsRepository.update({ ...where, readAt: IsNull() }, { readAt: now })).affected ?? 0;
        break;
      case 'unread':
        affected = (await this.notificationsRepository.update(where, { readAt: null })).affected ?? 0;
        break;
      case 'archive':
        await this.notificationsRepository.update({ ...where, readAt: IsNull() }, { readAt: now });
        affected = (await this.notificationsRepository.update(where, { archivedAt: now })).affected ?? 0;
        break;
      case 'unarchive':
        affected = (await this.notificationsRepository.update(where, { archivedAt: null })).affected ?? 0;
        break;
      case 'delete':
        affected = (await this.notificationsRepository.delete(where)).affected ?? 0;
        break;
    }

    const unreadCount = await this.emitChanged(recipientId);
    return { updated: affected, unreadCount };
  }

  private async findOwnedOrThrow(recipientId: string, id: string): Promise<AdminNotification> {
    const notification = await this.notificationsRepository.findOne({ where: { id, recipientId } });
    // Mismo 404 exista o no la notificación para otro admin - no se revela que el id es válido.
    if (!notification) throw new NotFoundException('No se encontró la notificación');
    return notification;
  }

  private async emitChanged(recipientId: string): Promise<number> {
    const unreadCount = await this.countUnread(recipientId);
    this.realtime.emit(recipientId, { type: 'notifications.changed', unreadCount });
    return unreadCount;
  }

  /** `true` si ese email pertenece a un administrador activo - lo usa el módulo de seguridad
   *  para decidir si un bloqueo de cuenta amerita un aviso. */
  async isAdminEmail(email: string): Promise<boolean> {
    const count = await this.usersRepository.count({
      where: { email: email.toLowerCase().trim(), role: Role.ADMIN, isActive: true },
    });
    return count > 0;
  }

  /** Usado por el barrido de reconciliación: ¿ya existe algún aviso con este `dedupeKey`? */
  async existsByDedupeKey(dedupeKey: string): Promise<boolean> {
    return (await this.notificationsRepository.count({ where: { dedupeKey } })) > 0;
  }

  /** Política de retención - borra notificaciones (y sus entregas) más viejas que el corte. */
  async purgeOlderThan(cutoff: Date): Promise<number> {
    const old = await this.notificationsRepository
      .createQueryBuilder('n')
      .select('n.id', 'id')
      .where('n.createdAt < :cutoff', { cutoff })
      .limit(1000)
      .getRawMany<{ id: string }>();
    if (old.length === 0) return 0;

    // Entregas primero: si algo se corta en el medio queda una notificación vieja sin entregas
    // (inofensivo, se borra en la próxima pasada), nunca entregas huérfanas.
    const ids = old.map((row) => row.id);
    await this.deliveriesRepository.delete({ notificationId: In(ids) });
    await this.notificationsRepository.delete({ id: In(ids) });
    return ids.length;
  }
}
