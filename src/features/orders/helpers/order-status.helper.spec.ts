import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { deriveOrderStatus } from './order-status.helper';

describe('deriveOrderStatus', () => {
  it('APPROVED mueve la orden a PAID', () => {
    expect(deriveOrderStatus(PaymentStatus.APPROVED, OrderStatus.PENDING_PAYMENT)).toBe(
      OrderStatus.PAID,
    );
  });

  it('REJECTED mantiene la orden en PENDING_PAYMENT para permitir un reintento', () => {
    expect(deriveOrderStatus(PaymentStatus.REJECTED, OrderStatus.PENDING_PAYMENT)).toBe(
      OrderStatus.PENDING_PAYMENT,
    );
  });

  it('CANCELLED sí cancela la orden (distinto de un simple rechazo)', () => {
    expect(deriveOrderStatus(PaymentStatus.CANCELLED, OrderStatus.PENDING_PAYMENT)).toBe(
      OrderStatus.CANCELLED,
    );
  });

  it('CHARGED_BACK conserva PAID en vez de inventar un estado nuevo', () => {
    expect(deriveOrderStatus(PaymentStatus.CHARGED_BACK, OrderStatus.PAID)).toBe(OrderStatus.PAID);
  });

  it('REFUNDED mueve la orden a REFUNDED', () => {
    expect(deriveOrderStatus(PaymentStatus.REFUNDED, OrderStatus.PAID)).toBe(OrderStatus.REFUNDED);
  });

  it('un PENDING sobre una orden ya EXPIRED no la revive', () => {
    expect(deriveOrderStatus(PaymentStatus.PENDING, OrderStatus.EXPIRED)).toBe(OrderStatus.EXPIRED);
  });
});
