/**
 * Estrategia de cálculo del costo de envío (ver `config/shipping.config.ts` y
 * `helpers/shipping-cost.helper.ts`) - nunca lo calcula ni lo inventa Mercado Pago (la Orders API
 * no tiene ningún campo de costo de envío, confirmado contra la documentación oficial), siempre
 * es lógica propia de este backend.
 */
export enum ShippingCostMode {
  FREE = 'free',
  FIXED = 'fixed',
  BY_PROVINCE = 'by_province',
  // Sin tarifa definida todavía - nunca bloquea el pago del subtotal: el costo se coordina y se
  // cobra aparte por WhatsApp después (ver `OrdersService.createFromCart`).
  TO_COORDINATE = 'to_coordinate',
}
