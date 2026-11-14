import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { Subscription, debounceTime } from 'rxjs';
import { Between, DataSource, In, IsNull, LessThan, LessThanOrEqual, Not, Repository } from 'typeorm';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { EmailService } from '../../common/services/email/email.service';
import { User } from '../auth/entities/user.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import {
  DeliveryChannel,
  DeliveryStatus,
  NotificationPriority,
  NotificationType,
} from './enums/notification.enums';
import { sanitizeErrorMessage } from './helpers/notification-text.helper';
import { formatArgentinaDateTime } from './helpers/quiet-hours.helper';
import { buildAdminAlertEmail, type AlertEmailOrderContext } from './notification-emails';
import { NotificationsPushService } from './notifications-push.service';
import { NotificationsService } from './notifications.service';

const BATCH = 25;
/** Espera antes de cada reintento (el último valor se repite si hay más intentos). */
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
/** Una entrega que lleva más que esto pendiente ya no se manda: un push de ayer no avisa nada. */
const STALE_AFTER_MS = 12 * 60 * 60_000;
const REPAIR_WINDOW_MS = 24 * 60 * 60_000;

type AttemptOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

/**
 * Consume el outbox de entregas (`notification_deliveries`). Corre fuera del request que originó
 * el evento, así que un servicio de push lento o Resend caído nunca frenan un pago ni un ajuste
 * de stock: lo peor que puede pasar es que el aviso externo llegue más tarde (reintentos con
 * espera creciente) o quede marcado como fallido - en el panel se ve igual desde el primer
 * instante.
 */
@Injectable()
export class NotificationDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private draining = false;
  private queuedSubscription: Subscription | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(NotificationDelivery)
    private readonly deliveriesRepository: Repository<NotificationDelivery>,
    @InjectRepository(AdminNotification)
    private readonly notificationsRepository: Repository<AdminNotification>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly pushService: NotificationsPushService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    // Entrega casi inmediata: apenas se encola algo se procesa, sin esperar al intervalo. El
    // `debounce` junta ráfagas (un evento para 3 admins = una sola pasada).
    this.queuedSubscription = this.notificationsService.deliveriesQueued$
      .pipe(debounceTime(250))
      .subscribe(() => void this.drain());
  }

  onModuleDestroy(): void {
    this.queuedSubscription?.unsubscribe();
  }

  /** Red de seguridad y motor de los reintentos programados. */
  @Interval(30_000)
  async tick(): Promise<void> {
    await this.drain();
  }

  /** Procesa todo lo que esté vencido. Nunca lanza y nunca se solapa consigo mismo. */
  async drain(): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    let processed = 0;
    try {
      await this.repairMissingDeliveries();
      await this.expireStale();

      for (;;) {
        const due = await this.deliveriesRepository.find({
          where: { status: DeliveryStatus.PENDING, nextAttemptAt: LessThanOrEqual(new Date()) },
          order: { nextAttemptAt: 'ASC' },
          take: BATCH,
        });
        if (due.length === 0) break;
        for (const delivery of due) await this.process(delivery);
        processed += due.length;
        if (due.length < BATCH) break;
      }
    } catch (error) {
      LoggerHelper(
        `Falló el procesamiento de entregas de notificaciones: ${sanitizeErrorMessage(error)}`,
        'NotificationDeliveryWorker',
        true,
      );
    } finally {
      this.draining = false;
    }
    return processed;
  }

  private async process(delivery: NotificationDelivery): Promise<void> {
    let outcome: AttemptOutcome;
    try {
      outcome = await this.attempt(delivery);
    } catch (error) {
      outcome = { kind: 'failed', reason: sanitizeErrorMessage(error) };
    }

    if (outcome.kind === 'sent') {
      await this.deliveriesRepository.update(
        { id: delivery.id },
        { status: DeliveryStatus.SENT, sentAt: new Date(), nextAttemptAt: null, lastError: null, attempts: delivery.attempts + 1 },
      );
      return;
    }

    if (outcome.kind === 'skipped') {
      await this.deliveriesRepository.update(
        { id: delivery.id },
        { status: DeliveryStatus.SKIPPED, nextAttemptAt: null, lastError: outcome.reason },
      );
      return;
    }

    const attempts = delivery.attempts + 1;
    const maxAttempts = this.configService.get<number>('notifications.deliveryMaxAttempts') ?? 5;
    if (attempts >= maxAttempts) {
      await this.deliveriesRepository.update(
        { id: delivery.id },
        { status: DeliveryStatus.FAILED, attempts, nextAttemptAt: null, lastError: outcome.reason },
      );
      LoggerHelper(
        `Entrega ${delivery.channel} de la notificación ${delivery.notificationId} descartada tras ${attempts} intentos: ${outcome.reason}`,
        'NotificationDeliveryWorker',
        true,
      );
      return;
    }

    const wait = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)];
    await this.deliveriesRepository.update(
      { id: delivery.id },
      { attempts, nextAttemptAt: new Date(Date.now() + wait), lastError: outcome.reason },
    );
  }

  private async attempt(delivery: NotificationDelivery): Promise<AttemptOutcome> {
    const notification = await this.notificationsRepository.findOne({ where: { id: delivery.notificationId } });
    if (!notification) return { kind: 'skipped', reason: 'La notificación ya no existe' };

    return delivery.channel === DeliveryChannel.PUSH
      ? this.attemptPush(notification)
      : this.attemptEmail(notification);
  }

  private async attemptPush(notification: AdminNotification): Promise<AttemptOutcome> {
    if (!this.pushService.enabled) return { kind: 'skipped', reason: 'Push no configurado en el servidor' };
    // Si el admin ya la vio en el panel, interrumpirlo con un push no suma nada.
    if (notification.readAt) return { kind: 'skipped', reason: 'Ya leída en el panel' };

    const result = await this.pushService.sendToAdmin(notification.recipientId, {
      title: notification.title,
      body: notification.body,
      url: notification.resourceUrl ?? '/admin/notificaciones',
      tag: notification.id,
      critical: notification.priority === NotificationPriority.CRITICAL,
    });

    if (result.attempted === 0) return { kind: 'skipped', reason: 'Sin dispositivos suscriptos' };
    // Alcanza con que llegue a un dispositivo: los que fallaron ya quedaron contados/depurados
    // en `sendToAdmin`, y reintentar reenviaría el aviso a los que sí lo recibieron.
    if (result.delivered > 0) return { kind: 'sent' };
    return { kind: 'failed', reason: result.lastError ?? 'El servicio de push rechazó el envío' };
  }

  private async attemptEmail(notification: AdminNotification): Promise<AttemptOutcome> {
    if (!this.configService.get<string>('resend.apiKey')) {
      return { kind: 'skipped', reason: 'Resend no configurado en el servidor' };
    }

    const admin = await this.usersRepository.findOne({ where: { id: notification.recipientId } });
    if (!admin?.isActive) return { kind: 'skipped', reason: 'El administrador ya no está activo' };

    const sent = await this.emailService.send(
      buildAdminAlertEmail({
        from: this.emailService.addresses.noReply,
        to: admin.email,
        frontendUrl: this.configService.get<string>('accountSecurity.frontendUrl')!,
        notification,
        order: await this.loadOrderContext(notification),
      }),
    );
    return sent ? { kind: 'sent' } : { kind: 'failed', reason: 'Resend no pudo enviar el correo' };
  }

  private async loadOrderContext(notification: AdminNotification): Promise<AlertEmailOrderContext | null> {
    if (notification.type !== NotificationType.ORDER_PAID || !notification.resourceId) return null;

    const order = await this.dataSource.getRepository(Order).findOne({ where: { id: notification.resourceId } });
    if (!order) return null;
    const items = await this.dataSource.getRepository(OrderItem).find({ where: { orderId: order.id } });

    return {
      orderId: order.id,
      totalValue: order.totalValue,
      deliveryMethod: order.deliveryMethod,
      paidAtLabel: formatArgentinaDateTime(order.paidAt ?? notification.createdAt),
      items: items.map((item) => ({
        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        lineTotalValue: item.lineTotalValue,
      })),
    };
  }

  /**
   * Segunda mitad del outbox (ver `NotificationsService.insertOnce`): si una notificación quedó
   * con `deliveryChannels` pero sin sus filas de entrega (el proceso murió entre las dos
   * escrituras), acá se crean. Idempotente por el índice único `(notificationId, channel)`.
   */
  private async repairMissingDeliveries(): Promise<void> {
    const now = Date.now();
    const candidates = await this.notificationsRepository.find({
      where: {
        deliveryChannels: Not(IsNull()),
        // El minuto de margen evita competir con un `publish` que todavía está encolando.
        createdAt: Between(new Date(now - REPAIR_WINDOW_MS), new Date(now - 60_000)),
      },
      select: { id: true, recipientId: true, deliveryChannels: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    if (candidates.length === 0) return;

    const existing = await this.deliveriesRepository.find({
      where: { notificationId: In(candidates.map((candidate) => candidate.id)) },
      select: { notificationId: true, channel: true },
    });
    const have = new Set(existing.map((delivery) => `${delivery.notificationId}:${delivery.channel}`));

    for (const candidate of candidates) {
      const missing = (candidate.deliveryChannels ?? []).filter((channel) => !have.has(`${candidate.id}:${channel}`));
      if (missing.length > 0) await this.notificationsService.enqueueDeliveries(candidate, missing);
    }
  }

  private async expireStale(): Promise<void> {
    await this.deliveriesRepository.update(
      { status: DeliveryStatus.PENDING, createdAt: LessThan(new Date(Date.now() - STALE_AFTER_MS)) },
      { status: DeliveryStatus.FAILED, nextAttemptAt: null, lastError: 'Venció sin poder entregarse' },
    );
  }
}
