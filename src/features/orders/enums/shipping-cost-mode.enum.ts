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
  // Sin tarifa definida todavía - la orden queda en `OrderStatus.AWAITING_SHIPPING_QUOTE` hasta
  // que un admin la fije y el comprador la acepte (ver `OrdersService.createFromCart`).
  TO_COORDINATE = 'to_coordinate',
}
