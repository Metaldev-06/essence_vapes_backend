import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

/**
 * Deriva el estado de negocio de la orden a partir del estado del pago - función pura, sin DI
 * (ver `order-totals.helper.ts`). Un `REJECTED` NO cancela la orden: se deja en
 * `PENDING_PAYMENT` (con el stock todavía reservado, dentro de la ventana de expiración) para
 * permitir un reintento seguro, tal como pide la tarea. Solo una cancelación/expiración
 * explícita saca a la orden de `PENDING_PAYMENT` sin haber sido pagada.
 */
export const deriveOrderStatus = (
  paymentStatus: PaymentStatus,
  currentOrderStatus: OrderStatus,
): OrderStatus => {
  switch (paymentStatus) {
    case PaymentStatus.APPROVED:
      return OrderStatus.PAID;
    case PaymentStatus.IN_PROCESS:
      return OrderStatus.PROCESSING;
    case PaymentStatus.REFUNDED:
      return OrderStatus.REFUNDED;
    case PaymentStatus.CHARGED_BACK:
      // La orden ya había sido pagada - el contracargo queda reflejado en `paymentStatus`, no
      // se inventa un `OrderStatus` nuevo para esto.
      return OrderStatus.PAID;
    case PaymentStatus.CANCELLED:
      // Solo si la propia orden de Mercado Pago fue cancelada explícitamente (no un simple
      // rechazo) - distinto de REJECTED, que mantiene la orden reintentable.
      return OrderStatus.CANCELLED;
    case PaymentStatus.REJECTED:
    case PaymentStatus.PENDING:
    default:
      return currentOrderStatus === OrderStatus.PENDING_PAYMENT
        ? OrderStatus.PENDING_PAYMENT
        : currentOrderStatus;
  }
};
