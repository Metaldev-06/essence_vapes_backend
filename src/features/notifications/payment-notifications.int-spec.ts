import { createHmac } from 'crypto';

import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { EmailService } from '../../common/services/email/email.service';
import { PaginationService } from '../../common/services/pagination/pagination.service';
import { Address } from '../addresses/entities/address.entity';
import { CartService } from '../cart/cart.service';
import { OrderAuditLog } from '../orders/entities/order-audit-log.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { DeliveryMethod } from '../orders/enums/delivery-method.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { PaymentStatus } from '../orders/enums/payment-status.enum';
import { OrdersService } from '../orders/orders.service';
import { PaymentAttempt } from '../payments/entities/payment-attempt.entity';
import { PaymentWebhookEvent } from '../payments/entities/payment-webhook-event.entity';
import { MercadoPagoService, type MpOrderResponse } from '../payments/mercadopago.service';
import { PaymentsWebhookController } from '../payments/payments-webhook.controller';
import { PaymentsService } from '../payments/payments.service';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationType } from './enums/notification.enums';
import { StockAlertService } from './stock-alert.service';
import { createNotificationsTestingModule, createUser } from './testing/notifications-testing';

const WEBHOOK_SECRET = 'test-webhook-secret';
const MP_ORDER_ID = 'ORD01TESTMPORDER';

/** Deja terminar los `void this.notify...()` que el flujo de pago dispara sin esperar. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe('Notificaciones del flujo de pago (Mercado Pago)', () => {
  let moduleRef: TestingModule;
  let payments: PaymentsService;
  let webhook: PaymentsWebhookController;
  let orders: Repository<Order>;
  let attempts: Repository<PaymentAttempt>;
  let notifications: Repository<AdminNotification>;
  let order: Order;

  const mercadoPago = { getOrder: jest.fn(), createOrder: jest.fn() };
  const email = {
    addresses: { sales: 'ventas@test.local', noReply: 'no-reply@test.local' },
    send: jest.fn(),
  };

  const mpOrder = (status: string, overrides: Partial<MpOrderResponse> = {}): MpOrderResponse => ({
    id: MP_ORDER_ID,
    status,
    total_amount: '45000.00',
    transactions: { payments: [{ id: 'PAY01', status, status_detail: 'accredited' } as never] },
    ...overrides,
  });

  /** Entrega un webhook con firma válida, igual que lo haría Mercado Pago. */
  const deliverWebhook = (notificationId: string, dataId = MP_ORDER_ID) => {
    const ts = String(Date.now());
    const requestId = `req-${notificationId}`;
    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac('sha256', WEBHOOK_SECRET).update(manifest).digest('hex');
    return webhook.handle(dataId, 'order', `ts=${ts},v1=${v1}`, requestId, {
      id: notificationId,
      type: 'order',
      data: { id: dataId },
    });
  };

  const ofType = (type: NotificationType) => notifications.find({ where: { type } });

  beforeEach(async () => {
    jest.clearAllMocks();
    email.send.mockResolvedValue(true);

    moduleRef = await createNotificationsTestingModule({
      entities: [Order, OrderItem, Address, OrderAuditLog, PaymentAttempt, PaymentWebhookEvent, Product, ProductVariant],
      providers: [
        PaymentsService,
        OrdersService,
        StockAlertService,
        PaymentsWebhookController,
        { provide: MercadoPagoService, useValue: mercadoPago },
        { provide: EmailService, useValue: email },
        { provide: CartService, useValue: {} },
        { provide: PaginationService, useValue: {} },
      ],
      config: {
        'mercadopago.webhookSecret': WEBHOOK_SECRET,
        'accountSecurity.frontendUrl': 'https://tienda.test',
      },
    });

    payments = moduleRef.get(PaymentsService);
    webhook = moduleRef.get(PaymentsWebhookController);
    orders = moduleRef.get(getRepositoryToken(Order));
    attempts = moduleRef.get(getRepositoryToken(PaymentAttempt));
    notifications = moduleRef.get(getRepositoryToken(AdminNotification));

    const buyer = await createUser(moduleRef);
    order = await orders.save(
      orders.create({
        userId: buyer.id,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        subtotalValue: 45_000,
        totalValue: 45_000,
        currency: 'ARS',
        buyerName: 'María Cliente',
        buyerEmail: 'maria.cliente@example.com',
        buyerPhone: '+5491155550000',
        deliveryMethod: DeliveryMethod.HOME_DELIVERY,
        shippingAddress: null,
        pickupDetails: null,
        termsAcceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 1_800_000),
      }),
    );
    await attempts.save(
      attempts.create({
        orderId: order.id,
        idempotencyKey: 'idem-1',
        mpOrderId: MP_ORDER_ID,
        status: PaymentStatus.PENDING,
        amountValue: 45_000,
      }),
    );
  });

  afterEach(async () => {
    await settle();
    await moduleRef.close();
  });

  // Escenario 1 de la tarea.
  it('un pago aprobado genera una sola notificación de pedido pagado', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));

    await deliverWebhook('notif-1');
    await settle();

    const paid = await ofType(NotificationType.ORDER_PAID);
    expect(paid).toHaveLength(1);
    expect(paid[0].title).toBe(`Nuevo pedido pagado #${order.id.slice(0, 8)}`);
    expect(paid[0].body).toContain('$45.000');
    expect(paid[0].body).toContain('Envío a domicilio');
    expect(paid[0].resourceUrl).toBe(`/admin/ventas/${order.id}`);
    expect((await orders.findOneByOrFail({ id: order.id })).status).toBe(OrderStatus.PAID);
  });

  it('la notificación no expone datos privados del comprador', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));

    await deliverWebhook('notif-1');
    await settle();

    const [paid] = await ofType(NotificationType.ORDER_PAID);
    const text = `${paid.title} ${paid.body} ${JSON.stringify(paid.metadata)}`;
    expect(text).not.toContain('María');
    expect(text).not.toContain('maria.cliente@example.com');
    expect(text).not.toContain('5491155550000');
  });

  // Escenario 2 de la tarea.
  it('un webhook duplicado no genera notificaciones duplicadas', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));

    // El mismo evento reintentado (mismo id de notificación)...
    await deliverWebhook('notif-1');
    await deliverWebhook('notif-1');
    // ...y un evento DISTINTO de Mercado Pago sobre la misma operación ya aprobada.
    await deliverWebhook('notif-2');
    await deliverWebhook('notif-3');
    await settle();

    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(1);
    // El reintento exacto ni siquiera vuelve a consultar a Mercado Pago.
    expect(mercadoPago.getOrder).toHaveBeenCalledTimes(3);
  });

  it('webhooks simultáneos del mismo pago siguen dejando una sola notificación', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));

    await Promise.all(['a', 'b', 'c', 'd'].map((id) => deliverWebhook(`notif-${id}`)));
    await settle();

    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(1);
  });

  // Escenario 3 de la tarea.
  it.each([
    ['action_required', PaymentStatus.PENDING],
    ['processing', PaymentStatus.IN_PROCESS],
    ['failed', PaymentStatus.REJECTED],
  ])('un pago "%s" no se informa como aprobado', async (mpStatus, expectedStatus) => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder(mpStatus));

    await deliverWebhook('notif-1');
    await settle();

    expect(await notifications.count()).toBe(0);
    const fresh = await orders.findOneByOrFail({ id: order.id });
    expect(fresh.paymentStatus).toBe(expectedStatus);
    expect(fresh.status).not.toBe(OrderStatus.PAID);
  });

  it('avisa recién cuando el pago pendiente finalmente se aprueba', async () => {
    mercadoPago.getOrder.mockResolvedValueOnce(mpOrder('processing'));
    await deliverWebhook('notif-1');
    await settle();
    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(0);

    mercadoPago.getOrder.mockResolvedValueOnce(mpOrder('processed'));
    await deliverWebhook('notif-2');
    await settle();
    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(1);
  });

  it('una firma inválida no procesa nada ni notifica', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));

    await expect(
      webhook.handle(MP_ORDER_ID, 'order', 'ts=1,v1=deadbeef', 'req', { id: 'x', data: { id: MP_ORDER_ID } }),
    ).rejects.toThrow('Firma de webhook inválida');
    await settle();

    expect(mercadoPago.getOrder).not.toHaveBeenCalled();
    expect(await notifications.count()).toBe(0);
  });

  // Escenario 9 de la tarea.
  it('un fallo en el envío de correo no afecta el procesamiento del pedido', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));
    // Contrato real de `EmailService.send`: nunca lanza, devuelve `false` si Resend falló.
    email.send.mockResolvedValue(false);

    await expect(deliverWebhook('notif-1')).resolves.toEqual({ received: true });
    await settle();

    const fresh = await orders.findOneByOrFail({ id: order.id });
    expect(fresh.status).toBe(OrderStatus.PAID);
    expect(fresh.paidAt).not.toBeNull();
    expect((await attempts.findOneByOrFail({ orderId: order.id })).status).toBe(PaymentStatus.APPROVED);
    // El aviso al admin no depende del correo al cliente.
    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(1);
  });

  it('un fallo al publicar la notificación tampoco afecta al pago', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));
    jest.spyOn(notifications, 'save').mockRejectedValue(new Error('tabla caída'));

    await expect(deliverWebhook('notif-1')).resolves.toEqual({ received: true });
    await settle();

    expect((await orders.findOneByOrFail({ id: order.id })).status).toBe(OrderStatus.PAID);
  });

  it('avisa el reembolso y el contracargo una sola vez cada uno', async () => {
    mercadoPago.getOrder.mockResolvedValueOnce(mpOrder('processed'));
    await deliverWebhook('notif-1');
    mercadoPago.getOrder.mockResolvedValue(mpOrder('charged_back'));
    await deliverWebhook('notif-2');
    await deliverWebhook('notif-3');
    await settle();

    const chargebacks = await ofType(NotificationType.PAYMENT_CHARGED_BACK);
    expect(chargebacks).toHaveLength(1);
    expect(chargebacks[0].priority).toBe('critical');

    mercadoPago.getOrder.mockResolvedValue(mpOrder('refunded'));
    await deliverWebhook('notif-4');
    await settle();
    expect(await ofType(NotificationType.PAYMENT_REFUNDED)).toHaveLength(1);
  });

  it('avisa la cancelación de Mercado Pago', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('canceled'));

    await deliverWebhook('notif-1');
    await settle();

    expect(await ofType(NotificationType.ORDER_CANCELLED)).toHaveLength(1);
    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(0);
  });

  it('alerta una inconsistencia si el pago se aprueba sobre una orden ya vencida', async () => {
    await orders.update({ id: order.id }, { status: OrderStatus.EXPIRED, expiresAt: null });
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed'));

    await deliverWebhook('notif-1');
    await settle();

    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(1);
    const [mismatch] = await ofType(NotificationType.PAYMENT_MISMATCH);
    expect(mismatch.body).toContain('reserva de stock se liberó');
  });

  it('alerta una inconsistencia si el importe cobrado difiere del pedido', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed', { total_amount: '40000.00' }));

    await deliverWebhook('notif-1');
    await settle();

    const [mismatch] = await ofType(NotificationType.PAYMENT_MISMATCH);
    expect(mismatch.body).toContain('$40000');
    expect(mismatch.body).toContain('$45000');
  });

  it('avisa (una vez) un webhook que no pudo procesarse y deja que Mercado Pago reintente', async () => {
    mercadoPago.getOrder.mockRejectedValue(new Error('MP 503 Bearer APP_USR-1234567890-secreto'));

    await expect(deliverWebhook('notif-1')).rejects.toThrow();
    await expect(deliverWebhook('notif-1')).rejects.toThrow();
    await settle();

    const unprocessed = await ofType(NotificationType.PAYMENT_WEBHOOK_UNPROCESSED);
    expect(unprocessed).toHaveLength(1);
    // Nunca se filtra el detalle del error (podría traer credenciales) al cuerpo del aviso.
    expect(unprocessed[0].body).not.toContain('APP_USR');
    // No quedó marcado como procesado: el reintento de MP vuelve a entrar.
    expect(await moduleRef.get<Repository<PaymentWebhookEvent>>(getRepositoryToken(PaymentWebhookEvent)).count()).toBe(0);
  });

  it('avisa un webhook de una operación que no corresponde a ningún intento registrado', async () => {
    mercadoPago.getOrder.mockResolvedValue(mpOrder('processed', { id: 'ORDDESCONOCIDA' }));

    await deliverWebhook('notif-1', 'ORDDESCONOCIDA');
    await settle();

    expect(await ofType(NotificationType.PAYMENT_WEBHOOK_UNPROCESSED)).toHaveLength(1);
    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(0);
  });

  it('reconciliar el mismo pago directamente varias veces sigue dejando un solo aviso', async () => {
    for (let i = 0; i < 3; i += 1) {
      await payments.reconcileFromMercadoPagoOrder(mpOrder('processed'));
    }
    await settle();

    expect(await ofType(NotificationType.ORDER_PAID)).toHaveLength(1);
  });
});
