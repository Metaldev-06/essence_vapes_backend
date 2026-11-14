import { NotFoundException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Role } from '../../common/enums/system-role.enum';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import {
  DeliveryChannel,
  DeliveryStatus,
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from './enums/notification.enums';
import { orderPaidEvent, stockOutEvent, type NotificationEvent } from './notification-events';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsRealtimeService, type NotificationRealtimeEvent } from './notifications-realtime.service';
import { NotificationsService } from './notifications.service';
import { createNotificationsTestingModule, createUser } from './testing/notifications-testing';

const order = (id: string, totalValue = 45_000) => ({
  id,
  totalValue,
  deliveryMethod: 'home_delivery',
  paidAt: new Date('2026-11-14T12:00:00Z'),
});

const ORDER_A = '11111111-1111-4111-8111-111111111111';
const ORDER_B = '22222222-2222-4222-8222-222222222222';

describe('NotificationsService', () => {
  let moduleRef: TestingModule;
  let service: NotificationsService;
  let settings: NotificationSettingsService;
  let realtime: NotificationsRealtimeService;
  let notifications: Repository<AdminNotification>;
  let deliveries: Repository<NotificationDelivery>;

  beforeEach(async () => {
    moduleRef = await createNotificationsTestingModule();
    service = moduleRef.get(NotificationsService);
    settings = moduleRef.get(NotificationSettingsService);
    realtime = moduleRef.get(NotificationsRealtimeService);
    notifications = moduleRef.get(getRepositoryToken(AdminNotification));
    deliveries = moduleRef.get(getRepositoryToken(NotificationDelivery));
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('publish', () => {
    it('crea una notificación por cada admin activo y ninguna para clientes o admins inactivos', async () => {
      const adminA = await createUser(moduleRef);
      const adminB = await createUser(moduleRef);
      await createUser(moduleRef, { role: Role.REGULAR });
      await createUser(moduleRef, { isActive: false });

      const created = await service.publish(orderPaidEvent(order(ORDER_A)));

      expect(created.map((n) => n.recipientId).sort()).toEqual([adminA.id, adminB.id].sort());
      expect(await notifications.count()).toBe(2);
    });

    it('es idempotente: publicar dos veces el mismo evento deja una sola notificación', async () => {
      await createUser(moduleRef);

      const first = await service.publish(orderPaidEvent(order(ORDER_A)));
      const second = await service.publish(orderPaidEvent(order(ORDER_A)));

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);
      expect(await notifications.count()).toBe(1);
    });

    it('sigue siendo idempotente con publicaciones simultáneas del mismo evento', async () => {
      await createUser(moduleRef);

      const results = await Promise.all(
        Array.from({ length: 8 }, () => service.publish(orderPaidEvent(order(ORDER_A)))),
      );

      expect(results.flat()).toHaveLength(1);
      expect(await notifications.count()).toBe(1);
    });

    it('nunca lanza aunque falle por dentro', async () => {
      await createUser(moduleRef);
      jest.spyOn(settings, 'getPreferencesFor').mockRejectedValueOnce(new Error('db caída'));
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(service.publish(orderPaidEvent(order(ORDER_A)))).resolves.toEqual([]);
      logSpy.mockRestore();
    });

    it('no incluye al admin que causó el evento', async () => {
      const actor = await createUser(moduleRef);
      const other = await createUser(moduleRef);

      const created = await service.publish({ ...orderPaidEvent(order(ORDER_A)), excludeAdminId: actor.id });

      expect(created.map((n) => n.recipientId)).toEqual([other.id]);
    });

    it('sanea el texto y descarta una URL que no sea interna del panel', async () => {
      await createUser(moduleRef);
      const event: NotificationEvent = {
        type: NotificationType.STOCK_OUT,
        dedupeKey: 'test:sanitize',
        title: 'Sin stock: <img src=x onerror=alert(1)>Perfume\n\tX',
        body: 'a'.repeat(900),
        resourceUrl: 'https://evil.example/phish',
      };

      const [created] = await service.publish(event);

      expect(created.title).toBe('Sin stock: Perfume X');
      expect(created.body.length).toBeLessThanOrEqual(500);
      expect(created.resourceUrl).toBeNull();
    });

    it('frena el spam de un mismo tipo dentro de la ventana', async () => {
      await createUser(moduleRef);
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      // SECURITY_ADMIN_LOCKOUT admite 5 por ventana.
      for (let i = 0; i < 8; i += 1) {
        await service.publish({
          type: NotificationType.SECURITY_ADMIN_LOCKOUT,
          dedupeKey: `lockout:${i}`,
          title: 'Intentos sospechosos',
          body: 'x',
        });
      }

      expect(await notifications.count()).toBe(5);
      logSpy.mockRestore();
    });

    it('emite el evento en tiempo real solo al destinatario', async () => {
      const adminA = await createUser(moduleRef);
      const adminB = await createUser(moduleRef);
      const seenByB: NotificationRealtimeEvent[] = [];
      const subscription = realtime.streamFor(adminB.id).subscribe((event) => seenByB.push(event));

      await service.publish({ ...orderPaidEvent(order(ORDER_A)), excludeAdminId: adminB.id });
      expect(seenByB).toHaveLength(0);

      await service.publish({ ...orderPaidEvent(order(ORDER_B)), excludeAdminId: adminA.id });
      expect(seenByB).toHaveLength(1);
      expect(seenByB[0]).toMatchObject({ type: 'notification.created', unreadCount: 1 });
      subscription.unsubscribe();
    });
  });

  // Escenario 8 de la tarea: las preferencias de canales se respetan.
  describe('preferencias de canal', () => {
    const subscribe = (adminId: string) =>
      moduleRef.get<Repository<PushSubscription>>(getRepositoryToken(PushSubscription)).save({
        adminId,
        endpoint: `https://fcm.googleapis.com/fcm/send/${adminId}`,
        p256dh: 'p'.repeat(40),
        auth: 'a'.repeat(16),
        deviceLabel: 'Chrome en Windows',
      });

    const channelsOf = async (notificationId: string) =>
      (await deliveries.find({ where: { notificationId } })).map((d) => d.channel).sort();

    it('usa los defaults del catálogo cuando el admin no configuró nada', async () => {
      const admin = await createUser(moduleRef);
      await subscribe(admin.id);

      const [paid] = await service.publish(orderPaidEvent(order(ORDER_A)));
      const [message] = await service.publish({
        type: NotificationType.CUSTOMER_NEW_MESSAGE,
        dedupeKey: 'msg:1',
        title: 'Nuevo mensaje',
        body: 'x',
      });

      expect(await channelsOf(paid.id)).toEqual([DeliveryChannel.EMAIL, DeliveryChannel.PUSH]);
      expect(await channelsOf(message.id)).toEqual([]);
    });

    it('no crea entrega push si el admin no tiene ningún dispositivo suscripto', async () => {
      await createUser(moduleRef);

      const [paid] = await service.publish(orderPaidEvent(order(ORDER_A)));

      expect(await channelsOf(paid.id)).toEqual([DeliveryChannel.EMAIL]);
    });

    it('respeta los canales elegidos por cada admin de forma independiente', async () => {
      const onlyPanel = await createUser(moduleRef);
      const onlyEmail = await createUser(moduleRef);
      const disabled = await createUser(moduleRef);
      await Promise.all([onlyPanel, onlyEmail, disabled].map((admin) => subscribe(admin.id)));

      const type = NotificationType.ORDER_PAID;
      await settings.updatePreferences(onlyPanel.id, {
        events: [{ type, enabled: true, inApp: true, push: false, email: false }],
      });
      await settings.updatePreferences(onlyEmail.id, {
        events: [{ type, enabled: true, inApp: false, push: false, email: true }],
      });
      await settings.updatePreferences(disabled.id, {
        events: [{ type, enabled: false, inApp: true, push: true, email: true }],
      });

      const created = await service.publish(orderPaidEvent(order(ORDER_A)));
      const byRecipient = new Map(created.map((n) => [n.recipientId, n]));

      expect(byRecipient.has(disabled.id)).toBe(false);
      expect(await channelsOf(byRecipient.get(onlyPanel.id)!.id)).toEqual([]);
      expect(await channelsOf(byRecipient.get(onlyEmail.id)!.id)).toEqual([DeliveryChannel.EMAIL]);

      // "Solo email" no aparece en el panel ni cuenta como sin leer.
      expect(await service.countUnread(onlyEmail.id)).toBe(0);
      expect((await service.findForAdmin(onlyEmail.id, {})).data).toHaveLength(0);
      expect(await service.countUnread(onlyPanel.id)).toBe(1);
    });

    it('un evento crítico siempre queda en el panel aunque el admin lo desactive', async () => {
      const admin = await createUser(moduleRef);
      const type = NotificationType.PAYMENT_CHARGED_BACK;
      await settings.updatePreferences(admin.id, {
        events: [{ type, enabled: false, inApp: false, push: false, email: false }],
      });

      const [created] = await service.publish({ type, dedupeKey: 'cb:1', title: 'Contracargo', body: 'x' });

      expect(created.inApp).toBe(true);
      expect(await channelsOf(created.id)).toEqual([]);
    });

    it('en horario de silencio omite push/email de lo no crítico, pero no de lo crítico', async () => {
      const admin = await createUser(moduleRef);
      await subscribe(admin.id);
      // Rango que cubre las 24 h menos un minuto: siempre "ahora" cae adentro.
      await settings.updatePreferences(admin.id, {
        quietHoursEnabled: true,
        quietHoursStart: 0,
        quietHoursEnd: 1439,
      });
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: new Date('2026-11-14T15:00:00Z') });

      const [normal] = await service.publish(orderPaidEvent(order(ORDER_A)));
      const [critical] = await service.publish({
        type: NotificationType.PAYMENT_CHARGED_BACK,
        dedupeKey: 'cb:quiet',
        title: 'Contracargo',
        body: 'x',
      });
      jest.useRealTimers();

      const statusOf = async (id: string) =>
        [...new Set((await deliveries.find({ where: { notificationId: id } })).map((d) => d.status))];
      expect(await statusOf(normal.id)).toEqual([DeliveryStatus.SKIPPED]);
      expect(await statusOf(critical.id)).toEqual([DeliveryStatus.PENDING]);
      // Lo silenciado igual queda visible en el panel.
      expect(await service.countUnread(admin.id)).toBe(2);
    });
  });

  // Escenario 6 de la tarea: un admin no puede acceder a las notificaciones de otro.
  describe('aislamiento entre administradores', () => {
    it('cada admin solo lista y cuenta las suyas', async () => {
      const adminA = await createUser(moduleRef);
      const adminB = await createUser(moduleRef);
      await service.publish({ ...orderPaidEvent(order(ORDER_A)), excludeAdminId: adminB.id });

      expect((await service.findForAdmin(adminA.id, {})).data).toHaveLength(1);
      expect((await service.findForAdmin(adminB.id, {})).data).toHaveLength(0);
      expect(await service.countUnread(adminB.id)).toBe(0);
    });

    it('rechaza leer, archivar o borrar la notificación de otro admin', async () => {
      const adminA = await createUser(moduleRef);
      const adminB = await createUser(moduleRef);
      const [ofA] = await service.publish({ ...orderPaidEvent(order(ORDER_A)), excludeAdminId: adminB.id });

      await expect(service.setRead(adminB.id, ofA.id, true)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.setArchived(adminB.id, ofA.id, true)).rejects.toBeInstanceOf(NotFoundException);
      for (const action of ['read', 'archive', 'delete'] as const) {
        expect(await service.bulk(adminB.id, [ofA.id], action)).toMatchObject({ updated: 0 });
      }

      const untouched = await notifications.findOneByOrFail({ id: ofA.id });
      expect(untouched.readAt).toBeNull();
      expect(untouched.archivedAt).toBeNull();
      expect(untouched.recipientId).toBe(adminA.id);
    });

    it('"marcar todas como leídas" no toca las de otro admin', async () => {
      const adminA = await createUser(moduleRef);
      const adminB = await createUser(moduleRef);
      await service.publish(orderPaidEvent(order(ORDER_A)));

      await service.markAllRead(adminA.id);

      expect(await service.countUnread(adminA.id)).toBe(0);
      expect(await service.countUnread(adminB.id)).toBe(1);
    });
  });

  // Escenario 7 de la tarea: las notificaciones se recuperan tras una desconexión.
  describe('resincronización tras una desconexión', () => {
    it('`since` devuelve lo creado mientras el cliente estuvo desconectado', async () => {
      const admin = await createUser(moduleRef);
      await service.publish(orderPaidEvent(order(ORDER_A)));

      // El cliente se desconecta acá: nadie escucha el stream en tiempo real.
      const disconnectedAt = new Date(Date.now() + 5);
      await new Promise((resolve) => setTimeout(resolve, 15));
      const [missed] = await service.publish(orderPaidEvent(order(ORDER_B)));

      const resync = await service.findForAdmin(admin.id, { since: disconnectedAt.toISOString() });

      expect(resync.data.map((n) => n.id)).toEqual([missed.id]);
      // El contador es siempre el real de la base, no depende de haber recibido los eventos.
      expect(resync.unreadCount).toBe(2);
    });
  });

  // Escenario 10 de la tarea: filtros, contadores y estados.
  describe('filtros, contadores y estados', () => {
    let adminId: string;
    let paid: AdminNotification;
    let stock: AdminNotification;

    beforeEach(async () => {
      adminId = (await createUser(moduleRef)).id;
      [paid] = await service.publish(orderPaidEvent(order(ORDER_A)));
      [stock] = await service.publish(
        stockOutEvent({ productId: 'p1', variantId: 'base', label: 'Dior Sauvage 100 ml', stock: 0, episode: 1 }),
      );
    });

    it('filtra por categoría, tipo y prioridad', async () => {
      const byCategory = await service.findForAdmin(adminId, { category: NotificationCategory.INVENTORY });
      const byType = await service.findForAdmin(adminId, { type: NotificationType.ORDER_PAID });
      const byPriority = await service.findForAdmin(adminId, { priority: NotificationPriority.CRITICAL });

      expect(byCategory.data.map((n) => n.id)).toEqual([stock.id]);
      expect(byType.data.map((n) => n.id)).toEqual([paid.id]);
      expect(byPriority.data).toHaveLength(0);
    });

    it('busca en título y cuerpo sin distinguir mayúsculas, tratando % y _ como texto', async () => {
      expect((await service.findForAdmin(adminId, { search: 'SAUVAGE' })).data.map((n) => n.id)).toEqual([stock.id]);
      expect((await service.findForAdmin(adminId, { search: '%' })).data).toHaveLength(0);
      expect((await service.findForAdmin(adminId, { search: '_' })).data).toHaveLength(0);
    });

    it('filtra por rango de fechas', async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const past = new Date(Date.now() - 60_000).toISOString();

      expect((await service.findForAdmin(adminId, { dateFrom: future })).data).toHaveLength(0);
      expect((await service.findForAdmin(adminId, { dateFrom: past, dateTo: future })).data).toHaveLength(2);
    });

    it('pagina y devuelve el total', async () => {
      const page = await service.findForAdmin(adminId, { limit: 1, offset: 1 });

      expect(page.data).toHaveLength(1);
      expect(page.pagination).toMatchObject({ total: 2, pages: 2, current: 2, limit: 1, offset: 1 });
    });

    it('mantiene el contador y los estados leído / no leído / archivado', async () => {
      expect(await service.countUnread(adminId)).toBe(2);

      await service.setRead(adminId, paid.id, true);
      expect(await service.countUnread(adminId)).toBe(1);
      expect((await service.findForAdmin(adminId, { status: 'unread' })).data.map((n) => n.id)).toEqual([stock.id]);
      expect((await service.findForAdmin(adminId, { status: 'read' })).data.map((n) => n.id)).toEqual([paid.id]);

      await service.setRead(adminId, paid.id, false);
      expect(await service.countUnread(adminId)).toBe(2);

      // Archivar algo sin leer lo saca del contador y de la vista activa.
      await service.setArchived(adminId, stock.id, true);
      expect(await service.countUnread(adminId)).toBe(1);
      expect((await service.findForAdmin(adminId, {})).data.map((n) => n.id)).toEqual([paid.id]);
      expect((await service.findForAdmin(adminId, { status: 'archived' })).data.map((n) => n.id)).toEqual([stock.id]);

      await service.setArchived(adminId, stock.id, false);
      expect((await service.findForAdmin(adminId, {})).data).toHaveLength(2);
    });

    it('aplica acciones masivas y avisa el contador nuevo por el canal en tiempo real', async () => {
      const events: NotificationRealtimeEvent[] = [];
      const subscription = realtime.streamFor(adminId).subscribe((event) => events.push(event));

      const read = await service.bulk(adminId, [paid.id, stock.id], 'read');
      expect(read).toEqual({ updated: 2, unreadCount: 0 });
      expect(events.at(-1)).toEqual({ type: 'notifications.changed', unreadCount: 0 });

      expect(await service.bulk(adminId, [paid.id], 'unread')).toEqual({ updated: 1, unreadCount: 1 });
      expect(await service.bulk(adminId, [paid.id, stock.id], 'delete')).toEqual({ updated: 2, unreadCount: 0 });
      expect(await notifications.count()).toBe(0);
      subscription.unsubscribe();
    });

    it('borra por retención las notificaciones viejas junto con sus entregas', async () => {
      await notifications.update({ id: paid.id }, { createdAt: new Date('2020-01-01T00:00:00Z') });

      const purged = await service.purgeOlderThan(new Date('2025-01-01T00:00:00Z'));

      expect(purged).toBe(1);
      expect(await notifications.count()).toBe(1);
      expect(await deliveries.count({ where: { notificationId: paid.id } })).toBe(0);
    });
  });
});
