/**
 * Modalidad de entrega elegida por el comprador antes de pagar - gestionada 100% por Essence
 * Vapes (sin Mercado Envíos ni ningún transportista integrado al sitio). Determina qué snapshot
 * se guarda en `Order` (`shippingAddress` vs `pickupDetails`) y qué subconjunto de
 * `LogisticsStatus` aplica (ver `helpers/logistics-status.helper.ts`).
 */
export enum DeliveryMethod {
  HOME_DELIVERY = 'home_delivery',
  PICKUP = 'pickup',
}
