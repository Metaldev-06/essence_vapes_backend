import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { MessageThreadState } from '../messages/entities/message-thread-state.entity';
import { Order } from '../orders/entities/order.entity';
import { DeliveryMethod } from '../orders/enums/delivery-method.enum';
import { LogisticsStatus } from '../orders/enums/logistics-status.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { PaymentStatus } from '../orders/enums/payment-status.enum';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { WithdrawalRequest } from '../withdrawal-requests/entities/withdrawal-request.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationType } from './enums/notification.enums';
import { NotificationDigestService } from './notification-digest.service';
import { orderPaidEvent } from './notification-events';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationsService } from './notifications.service';
import { StockAlertService } from './stock-alert.service';
import { createNotificationsTestingModule, createUser } from './testing/notifications-testing';

const HOUR = 3_600_000;

describe('NotificationSchedulerService', () => {
  let moduleRef: TestingModule;
  let scheduler: NotificationSchedulerService;
  let service: NotificationsService;
  let orders: Repository<Order>;
  let notifications: Repository<AdminNotification>;
  let adminId: string;

  const createOrder = (overrides: Partial<Order>) =>
    orders.save(
      orders.create({
        userId: adminId,
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.APPROVED,
        subtotalValue: 20_000,
        totalValue: 20_000,
        buyerName: 'x',
        buyerEmail: 'x@test.local',
        deliveryMethod: DeliveryMethod.HOME_DELIVERY,
        logisticsStatus: LogisticsStatus.PENDING_PREPARATION,
        termsAcceptedAt: new Date(),
        paidAt: new Date(Date.now() - 10 * 60_000),
        ...overrides,
      }),
    );

  const typesOf = async () => (await notifications.find()).map((notification) => notification.type).sort();

  beforeEach(async () => {
    moduleRef = await createNotificationsTestingModule({
      entities: [Order, WithdrawalRequest, MessageThreadState, Product, ProductVariant],
      providers: [
        NotificationSchedulerService,
        StockAlertService,
        { provide: NotificationDigestService, useValue: { runDue: jest.fn() } },
      ],
    });
    scheduler = moduleRef.get(NotificationSchedulerService);
    service = moduleRef.get(NotificationsService);
    orders = moduleRef.get(getRepositoryToken(Order));
    notifications = moduleRef.get(getRepositoryToken(AdminNotification));
    adminId = (await createUser(moduleRef)).id;
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('reconciliación de pedidos pagados', () => {
    it('recupera el aviso de un pedido pagado que quedó sin notificación', async () => {
      const lost = await createOrder({});

      expect(await scheduler.reconcilePaidOrders()).toBe(1);
      // Correrlo de nuevo no duplica.
      expect(await scheduler.reconcilePaidOrders()).toBe(0);

      const [notification] = await notifications.find();
      expect(notification.type).toBe(NotificationType.ORDER_PAID);
      expect(notification.resourceId).toBe(lost.id);
    });

    it('no toca un pedido que ya tiene su aviso', async () => {
      const order = await createOrder({});
      await service.publish(orderPaidEvent(order));

      expect(await scheduler.reconcilePaidOrders()).toBe(0);
      expect(await notifications.count()).toBe(1);
    });

    it('nunca avisa un pedido que no está pagado', async () => {
      await createOrder({ status: OrderStatus.PENDING_PAYMENT, paymentStatus: PaymentStatus.PENDING, paidAt: null });
      await createOrder({ status: OrderStatus.PROCESSING, paymentStatus: PaymentStatus.IN_PROCESS, paidAt: null });
      await createOrder({ status: OrderStatus.EXPIRED, paymentStatus: PaymentStatus.CANCELLED, paidAt: null });

      expect(await scheduler.reconcilePaidOrders()).toBe(0);
      expect(await notifications.count()).toBe(0);
    });

    it('le da margen al flujo normal: no reclama un pago de hace segundos', async () => {
      await createOrder({ paidAt: new Date() });

      expect(await scheduler.reconcilePaidOrders()).toBe(0);
    });
  });

  describe('pedidos demorados', () => {
    it('alerta una sola vez el pedido pagado que sigue sin preparar pasado el plazo', async () => {
      await createOrder({ paidAt: new Date(Date.now() - 30 * HOUR) });
      await createOrder({ paidAt: new Date(Date.now() - 2 * HOUR) });

      await scheduler.checkStaleOrders();
      await scheduler.checkStaleOrders();

      expect(await typesOf()).toEqual([NotificationType.ORDER_PENDING_PREPARATION]);
    });

    it('alerta el envío sin despachar y el retiro que no quedó listo', async () => {
      await createOrder({ paidAt: new Date(Date.now() - 80 * HOUR), logisticsStatus: LogisticsStatus.IN_PREPARATION });
      await createOrder({
        paidAt: new Date(Date.now() - 80 * HOUR),
        deliveryMethod: DeliveryMethod.PICKUP,
        logisticsStatus: LogisticsStatus.IN_PREPARATION,
      });
      // Ya despachado / ya listo para retirar: no son demoras.
      await createOrder({ paidAt: new Date(Date.now() - 80 * HOUR), logisticsStatus: LogisticsStatus.DISPATCHED });
      await createOrder({
        paidAt: new Date(Date.now() - 80 * HOUR),
        deliveryMethod: DeliveryMethod.PICKUP,
        logisticsStatus: LogisticsStatus.READY_FOR_PICKUP,
      });

      await scheduler.checkStaleOrders();

      expect(await typesOf()).toEqual([
        NotificationType.ORDER_PENDING_DISPATCH,
        NotificationType.ORDER_PENDING_DISPATCH,
      ]);
    });

    it('no revive pedidos más viejos que la ventana de revisión', async () => {
      await createOrder({ paidAt: new Date(Date.now() - 40 * 24 * HOUR) });

      await scheduler.checkStaleOrders();

      expect(await notifications.count()).toBe(0);
    });
  });

  it('alerta trámites y mensajes sin responder pasado el plazo', async () => {
    const withdrawals = moduleRef.get<Repository<WithdrawalRequest>>(getRepositoryToken(WithdrawalRequest));
    const threads = moduleRef.get<Repository<MessageThreadState>>(getRepositoryToken(MessageThreadState));
    const old = new Date(Date.now() - 30 * HOUR);
    const withdrawal = await withdrawals.save(
      withdrawals.create({
        trackingCode: 'ARR-0001',
        buyerName: 'x',
        email: 'x@test.local',
        productDescription: 'x',
      } as never),
    );
    await withdrawals.update({ id: (withdrawal as unknown as WithdrawalRequest).id }, { createdAt: old });
    await threads.save([
      threads.create({ resendThreadId: 't-sin-respuesta', inbox: 'contacto' as never, firstReceivedAt: old }),
      threads.create({
        resendThreadId: 't-respondido',
        inbox: 'contacto' as never,
        firstReceivedAt: old,
        firstRespondedAt: new Date(),
      }),
      threads.create({ resendThreadId: 't-reciente', inbox: 'contacto' as never, firstReceivedAt: new Date() }),
    ]);

    await scheduler.checkUnanswered();
    await scheduler.checkUnanswered();

    const created = await notifications.find();
    expect(created.map((n) => n.type)).toEqual([
      NotificationType.CUSTOMER_UNANSWERED,
      NotificationType.CUSTOMER_UNANSWERED,
    ]);
    expect(created.map((n) => n.resourceId).sort()).toEqual(
      [(withdrawal as unknown as WithdrawalRequest).id, 't-sin-respuesta'].sort(),
    );
  });

  it('convierte el fallo de un job en una notificación de sistema, sin propagar el error', async () => {
    await expect(
      scheduler.runJob('job de prueba', async () => {
        throw new Error('se rompió postgresql://user:secreto@host/db');
      }),
    ).resolves.toBeUndefined();

    const [notification] = await notifications.find();
    expect(notification.type).toBe(NotificationType.SYSTEM_JOB_FAILED);
    expect(notification.body).not.toContain('secreto');
  });

  it('aplica la política de retención', async () => {
    const order = await createOrder({});
    await service.publish(orderPaidEvent(order));
    await notifications.update({ recipientId: adminId }, { createdAt: new Date(Date.now() - 200 * 24 * HOUR) });

    expect(await scheduler.purgeOldNotifications()).toBe(1);
    expect(await notifications.count()).toBe(0);
  });
});
