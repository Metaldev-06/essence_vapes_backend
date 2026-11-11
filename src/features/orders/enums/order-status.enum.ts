/**
 * Estado de negocio de la orden - deliberadamente separado de `PaymentStatus` (estado del medio
 * de pago en sí). Una orden nunca se marca `PAID` por lo que diga el frontend: solo
 * `PaymentsService`, después de confirmar con Mercado Pago (webhook o consulta directa), la
 * mueve a este estado. Ver `helpers/mp-status-mapper.helper.ts` para la derivación.
 */
export enum OrderStatus {
  // Envío "a coordinar" sin tarifa definida todavía (ver `ShippingCostMode.TO_COORDINATE`) - la
  // orden existe y reservó stock, pero nunca es pagable (`OrdersService.getPayableOrderOrThrow`
  // exige exactamente `PENDING_PAYMENT`) hasta que un admin fije el costo y el comprador lo
  // acepte. Nunca lo deriva `deriveOrderStatus` - lo decide `OrdersService.createFromCart` al
  // crear la orden, no el estado del pago.
  AWAITING_SHIPPING_QUOTE = 'awaiting_shipping_quote',
  PENDING_PAYMENT = 'pending_payment',
  PROCESSING = 'processing',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}
