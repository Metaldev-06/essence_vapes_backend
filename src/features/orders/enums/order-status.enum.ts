/**
 * Estado de negocio de la orden - deliberadamente separado de `PaymentStatus` (estado del medio
 * de pago en sí). Una orden nunca se marca `PAID` por lo que diga el frontend: solo
 * `PaymentsService`, después de confirmar con Mercado Pago (webhook o consulta directa), la
 * mueve a este estado. Ver `helpers/mp-status-mapper.helper.ts` para la derivación.
 */
export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PROCESSING = 'processing',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}
