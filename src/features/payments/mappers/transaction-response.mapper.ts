import { formatPrice } from '../../products/helpers/format-price.helper';
import type { Order } from '../../orders/entities/order.entity';
import { PaymentAttempt } from '../entities/payment-attempt.entity';

/**
 * Fila del panel admin "Transacciones" (ver tarea, punto 6) - un `PaymentAttempt` enriquecido con
 * los datos del comprador de la orden asociada. `order` puede faltar en un caso anómalo (el
 * intento referencia una orden borrada) - nunca se rompe por eso, solo se omiten esos campos.
 */
export const toTransactionResponse = (attempt: PaymentAttempt, order: Order | undefined) => ({
  id: attempt.id,
  orderId: attempt.orderId,
  mpOrderId: attempt.mpOrderId ?? null,
  mpPaymentId: attempt.mpPaymentId ?? null,
  buyerName: order?.buyerName ?? null,
  buyerEmail: order?.buyerEmail ?? null,
  amountValue: attempt.amountValue ?? null,
  amount: attempt.amountValue != null ? formatPrice(attempt.amountValue) : null,
  currency: order?.currency ?? 'ARS',
  status: attempt.status,
  statusDetail: attempt.statusDetail ?? null,
  paymentMethodType: attempt.paymentMethodType ?? null,
  paymentMethodId: attempt.paymentMethodId ?? null,
  failureReason: attempt.failureReason ?? null,
  createdAt: attempt.createdAt,
  updatedAt: attempt.updatedAt,
});

export type TransactionResponse = ReturnType<typeof toTransactionResponse>;
