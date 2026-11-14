import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { EmailService } from '../../common/services/email/email.service';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { WithdrawalRequest } from '../withdrawal-requests/entities/withdrawal-request.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import {
  DeliveryChannel,
  DeliveryStatus,
  DigestFrequency,
  NotificationType,
} from './enums/notification.enums';
import { NotificationDeliveryWorker } from './notification-delivery.worker';
import { NotificationDigestService } from './notification-digest.service';
import { orderPaidEvent } from './notification-events';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsPushService, describeDevice, isAllowedPushEndpoint } from './notifications-push.service';
import { NotificationsService } from './notifications.service';
import { createNotificationsTestingModule, createUser } from './testing/notifications-testing';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const order = { id: ORDER_ID, totalValue: 45_000, deliveryMethod: 'pickup', paidAt: new Date() };
const endpointFor = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;
const subscriptionDto = (name: string) => ({
  endpoint: endpointFor(name),
  keys: { p256dh: 'p'.repeat(60), auth: 'a'.repeat(20) },
});

describe('Canales de entrega (push, email, resumen)', () => {
  let moduleRef: TestingModule;
  let service: NotificationsService;
  let settings: NotificationSettingsService;
  let push: NotificationsPushService;
  let worker: NotificationDeliveryWorker;
  let digest: NotificationDigestService;
  let deliveries: Repository<NotificationDelivery>;
  let notifications: Repository<AdminNotification>;
  let subscriptions: Repository<PushSubscription>;
  let sendPush: jest.SpyInstance;

  const email = {
    addresses: { noReply: 'no-reply@test.local' },
    send: jest.fn(),
  };

  const deliveryOf = (notificationId: string, channel: DeliveryChannel) =>
    deliveries.findOneByOrFail({ notificationId, channel });

  beforeEach(async () => {
    jest.clearAllMocks();
    email.send.mockResolvedValue(true);
    moduleRef = await createNotificationsTestingModule({
      entities: [Order, OrderItem, WithdrawalRequest],
      providers: [
        NotificationsPushService,
        NotificationDeliveryWorker,
        NotificationDigestService,
        { provide: EmailService, useValue: email },
      ],
      config: {
        'notifications.vapidPublicKey': 'BPublicKeyDePrueba',
        'notifications.vapidPrivateKey': 'clave-privada-de-prueba',
        'notifications.vapidSubject': 'mailto:test@test.local',
        'notifications.deliveryMaxAttempts': 3,
        'accountSecurity.frontendUrl': 'https://tienda.test/',
      },
    });
    service = moduleRef.get(NotificationsService);
    settings = moduleRef.get(NotificationSettingsService);
    push = moduleRef.get(NotificationsPushService);
    worker = moduleRef.get(NotificationDeliveryWorker);
    digest = moduleRef.get(NotificationDigestService);
    deliveries = moduleRef.get(getRepositoryToken(NotificationDelivery));
    notifications = moduleRef.get(getRepositoryToken(AdminNotification));
    subscriptions = moduleRef.get(getRepositoryToken(PushSubscription));
    // `transmit` es el único método que sale a la red (servicio de push del navegador).
    sendPush = jest.spyOn(push as never, 'transmit').mockResolvedValue({ statusCode: 201 } as never);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('entrega', () => {
    it('envía push y correo de un pedido pagado y los marca como enviados', async () => {
      const admin = await createUser(moduleRef);
      await push.subscribe(admin.id, subscriptionDto('pc'), 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0');
      const [notification] = await service.publish(orderPaidEvent(order));

      await worker.drain();

      expect((await deliveryOf(notification.id, DeliveryChannel.PUSH)).status).toBe(DeliveryStatus.SENT);
      expect((await deliveryOf(notification.id, DeliveryChannel.EMAIL)).status).toBe(DeliveryStatus.SENT);

      const [, payload] = sendPush.mock.calls[0];
      expect(JSON.parse(payload as string)).toMatchObject({
        title: `Nuevo pedido pagado #${ORDER_ID.slice(0, 8)}`,
        url: `/admin/ventas/${ORDER_ID}`,
        tag: notification.id,
      });

      const mail = email.send.mock.calls[0][0];
      expect(mail.to).toBe(admin.email);
      expect(mail.internal).toBe(true);
      expect(mail.html).toContain(`https://tienda.test/admin/ventas/${ORDER_ID}`);
    });

    it('no reenvía lo ya enviado', async () => {
      const admin = await createUser(moduleRef);
      await push.subscribe(admin.id, subscriptionDto('pc'), undefined);
      await service.publish(orderPaidEvent(order));

      await worker.drain();
      await worker.drain();
      await worker.drain();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    // Segunda mitad del escenario 9: el fallo del correo queda contenido en su entrega.
    it('un correo que falla se reintenta con espera y no toca la notificación', async () => {
      await createUser(moduleRef);
      email.send.mockResolvedValue(false);
      const [notification] = await service.publish(orderPaidEvent(order));

      await worker.drain();

      const delivery = await deliveryOf(notification.id, DeliveryChannel.EMAIL);
      expect(delivery.status).toBe(DeliveryStatus.PENDING);
      expect(delivery.attempts).toBe(1);
      expect(delivery.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 30_000);
      expect(delivery.lastError).toBe('Resend no pudo enviar el correo');
      // Todavía no venció la espera: otra pasada no lo reintenta.
      await worker.drain();
      expect(email.send).toHaveBeenCalledTimes(1);
      // La notificación sigue intacta y visible en el panel.
      expect(await service.countUnread(notification.recipientId)).toBe(1);
    });

    it('descarta la entrega tras agotar los reintentos', async () => {
      await createUser(moduleRef);
      email.send.mockResolvedValue(false);
      const [notification] = await service.publish(orderPaidEvent(order));

      for (let i = 0; i < 3; i += 1) {
        await deliveries.update({ notificationId: notification.id }, { nextAttemptAt: new Date(Date.now() - 1000) });
        await worker.drain();
      }

      const delivery = await deliveryOf(notification.id, DeliveryChannel.EMAIL);
      expect(delivery.status).toBe(DeliveryStatus.FAILED);
      expect(delivery.attempts).toBe(3);
      expect(email.send).toHaveBeenCalledTimes(3);
    });

    it('una excepción inesperada del canal tampoco rompe al worker', async () => {
      await createUser(moduleRef);
      email.send.mockRejectedValue(new Error('explotó Bearer abc.def.ghi'));
      const [notification] = await service.publish(orderPaidEvent(order));

      await expect(worker.drain()).resolves.toBe(1);

      const delivery = await deliveryOf(notification.id, DeliveryChannel.EMAIL);
      expect(delivery.status).toBe(DeliveryStatus.PENDING);
      expect(delivery.lastError).not.toContain('abc.def.ghi');
    });

    it('elimina la suscripción que el navegador dio de baja (410)', async () => {
      const admin = await createUser(moduleRef);
      await push.subscribe(admin.id, subscriptionDto('viejo'), undefined);
      sendPush.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
      await service.publish(orderPaidEvent(order));

      await worker.drain();

      expect(await subscriptions.count()).toBe(0);
    });

    it('no manda push de algo que el admin ya leyó en el panel', async () => {
      const admin = await createUser(moduleRef);
      await push.subscribe(admin.id, subscriptionDto('pc'), undefined);
      const [notification] = await service.publish(orderPaidEvent(order));
      await service.setRead(admin.id, notification.id, true);

      await worker.drain();

      expect(sendPush).not.toHaveBeenCalled();
      expect((await deliveryOf(notification.id, DeliveryChannel.PUSH)).status).toBe(DeliveryStatus.SKIPPED);
    });

    it('no procesa lo omitido por horario de silencio', async () => {
      const admin = await createUser(moduleRef);
      await push.subscribe(admin.id, subscriptionDto('pc'), undefined);
      await settings.updatePreferences(admin.id, { quietHoursEnabled: true, quietHoursStart: 0, quietHoursEnd: 1439 });
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: new Date('2026-11-14T15:00:00Z') });
      await service.publish(orderPaidEvent(order));
      await worker.drain();
      jest.useRealTimers();

      expect(sendPush).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });

    it('reconstruye las entregas si el proceso murió antes de encolarlas', async () => {
      await createUser(moduleRef);
      const [notification] = await service.publish(orderPaidEvent(order));
      // Simula la caída: la notificación quedó con su intención de entrega pero sin filas.
      await deliveries.clear();
      await notifications.update({ id: notification.id }, { createdAt: new Date(Date.now() - 5 * 60_000) });

      await worker.drain();

      expect((await deliveryOf(notification.id, DeliveryChannel.EMAIL)).status).toBe(DeliveryStatus.SENT);
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('da por vencida una entrega que lleva demasiado tiempo pendiente', async () => {
      await createUser(moduleRef);
      const [notification] = await service.publish(orderPaidEvent(order));
      await deliveries.update({ notificationId: notification.id }, { createdAt: new Date(Date.now() - 13 * 3_600_000) });
      // Fuera de la ventana de reparación para que no se vuelva a encolar.
      await notifications.update({ id: notification.id }, { deliveryChannels: null });

      await worker.drain();

      expect(email.send).not.toHaveBeenCalled();
      expect((await deliveryOf(notification.id, DeliveryChannel.EMAIL)).status).toBe(DeliveryStatus.FAILED);
    });
  });

  describe('suscripciones push', () => {
    it('solo acepta endpoints https de servicios de push conocidos', () => {
      expect(isAllowedPushEndpoint(endpointFor('x'))).toBe(true);
      expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
      expect(isAllowedPushEndpoint('https://web.push.apple.com/x')).toBe(true);
      expect(isAllowedPushEndpoint('https://wns2-by3p.notify.windows.com/w/?token=x')).toBe(true);
      expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false);
      expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
      expect(isAllowedPushEndpoint('https://localhost:3000/api')).toBe(false);
      expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
      expect(isAllowedPushEndpoint('no es una url')).toBe(false);
    });

    it('rechaza un endpoint fuera de la lista', async () => {
      const admin = await createUser(moduleRef);

      await expect(
        push.subscribe(admin.id, { ...subscriptionDto('x'), endpoint: 'https://interno.example/hook' }, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nunca devuelve el endpoint ni las claves', async () => {
      const admin = await createUser(moduleRef);

      const created = await push.subscribe(admin.id, subscriptionDto('pc'), 'Mozilla/5.0 (iPhone) Safari/605');
      const [listed] = await push.listForAdmin(admin.id);

      for (const response of [created, listed]) {
        expect(Object.keys(response).sort()).toEqual(['createdAt', 'deviceLabel', 'fingerprint', 'id', 'lastUsedAt']);
        expect(JSON.stringify(response)).not.toContain('fcm.googleapis.com');
      }
      expect(created.deviceLabel).toBe('Safari en iOS');
    });

    it('volver a suscribir el mismo navegador no duplica el dispositivo', async () => {
      const admin = await createUser(moduleRef);

      await push.subscribe(admin.id, subscriptionDto('pc'), undefined);
      await push.subscribe(admin.id, subscriptionDto('pc'), undefined);

      expect(await push.listForAdmin(admin.id)).toHaveLength(1);
    });

    it('un admin no puede ver ni eliminar el dispositivo de otro', async () => {
      const adminA = await createUser(moduleRef);
      const adminB = await createUser(moduleRef);
      const ofA = await push.subscribe(adminA.id, subscriptionDto('pc-a'), undefined);

      expect(await push.listForAdmin(adminB.id)).toHaveLength(0);
      await expect(push.remove(adminB.id, ofA.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(await push.listForAdmin(adminA.id)).toHaveLength(1);

      await push.remove(adminA.id, ofA.id);
      expect(await push.listForAdmin(adminA.id)).toHaveLength(0);
    });

    it('limita la cantidad de dispositivos por admin', async () => {
      const admin = await createUser(moduleRef);
      for (let i = 0; i < 10; i += 1) await push.subscribe(admin.id, subscriptionDto(`d${i}`), undefined);

      await expect(push.subscribe(admin.id, subscriptionDto('d10'), undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('describe el dispositivo sin guardar el User-Agent', () => {
      expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/130.0 Safari/537 Edg/130.0')).toBe('Edge en Windows');
      expect(describeDevice('Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile')).toBe('Chrome en Android');
      expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Firefox/132.0')).toBe('Firefox en macOS');
      expect(describeDevice(undefined)).toBe('Navegador en dispositivo desconocido');
    });
  });

  describe('resumen por correo', () => {
    // 2026-11-16 es lunes. 13:00 UTC = 10:00 en Argentina.
    const mondayTen = new Date('2026-11-16T13:00:00Z');
    const mondayEight = new Date('2026-11-16T11:00:00Z');
    const tuesdayTen = new Date('2026-11-17T13:00:00Z');

    const enableDigest = async (frequency: DigestFrequency, digestHour = 9) => {
      const admin = await createUser(moduleRef);
      await settings.updatePreferences(admin.id, { digestFrequency: frequency, digestHour });
      return admin;
    };

    it('lo envía una sola vez por día, a partir de la hora elegida', async () => {
      const admin = await enableDigest(DigestFrequency.DAILY);

      expect(await digest.runDue(mondayEight)).toBe(0);
      expect(await digest.runDue(mondayTen)).toBe(1);
      expect(await digest.runDue(new Date(mondayTen.getTime() + 3_600_000))).toBe(0);
      expect(await digest.runDue(tuesdayTen)).toBe(1);

      expect(email.send).toHaveBeenCalledTimes(2);
      expect(email.send.mock.calls[0][0]).toMatchObject({ to: admin.email, internal: true });
    });

    it('el semanal solo sale los lunes', async () => {
      await enableDigest(DigestFrequency.WEEKLY);

      expect(await digest.runDue(tuesdayTen)).toBe(0);
      expect(await digest.runDue(mondayTen)).toBe(1);
    });

    it('no lo envía a quien lo tiene desactivado', async () => {
      await enableDigest(DigestFrequency.OFF);
      await createUser(moduleRef);

      expect(await digest.runDue(mondayTen)).toBe(0);
    });

    it('si el envío falla, reintenta en la pasada siguiente', async () => {
      await enableDigest(DigestFrequency.DAILY);
      email.send.mockResolvedValueOnce(false);

      expect(await digest.runDue(mondayTen)).toBe(0);
      expect(await digest.runDue(new Date(mondayTen.getTime() + 3_600_000))).toBe(1);
    });

    it('resume ventas y alertas del período del propio admin', async () => {
      const admin = await enableDigest(DigestFrequency.DAILY);
      const orders = moduleRef.get<Repository<Order>>(getRepositoryToken(Order));
      const base = {
        userId: admin.id,
        subtotalValue: 30_000,
        totalValue: 30_000,
        buyerName: 'x',
        buyerEmail: 'x@test.local',
        termsAcceptedAt: mondayTen,
      };
      await orders.save([
        orders.create({ ...base, status: 'paid' as never, paidAt: new Date(mondayTen.getTime() - 3_600_000) }),
        orders.create({ ...base, status: 'paid' as never, paidAt: new Date(mondayTen.getTime() - 7_200_000) }),
        // Fuera del período y sin pagar: no cuentan.
        orders.create({ ...base, status: 'paid' as never, paidAt: new Date(mondayTen.getTime() - 3 * 86_400_000) }),
        orders.create({ ...base, status: 'pending_payment' as never, paidAt: null }),
      ]);
      await service.publish({
        type: NotificationType.PAYMENT_CHARGED_BACK,
        dedupeKey: 'cb:digest',
        title: 'Contracargo · pedido #abc',
        body: 'Revisá el caso',
      });
      await notifications.update({ recipientId: admin.id }, { createdAt: new Date(mondayTen.getTime() - 60_000) });

      const data = await digest.collect(admin.id, false, mondayTen);

      expect(data).toMatchObject({ paidOrders: 2, revenueValue: 60_000, pendingPreparation: 3, unreadNotifications: 1 });
      expect(data.highlights).toEqual([{ title: 'Contracargo · pedido #abc', body: 'Revisá el caso' }]);
    });
  });
});
