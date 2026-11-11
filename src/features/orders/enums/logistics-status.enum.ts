/**
 * Estado de preparación/entrega - deliberadamente independiente de `PaymentStatus`/`OrderStatus`
 * (ver tarea: nunca se puede considerar una compra "pagada" por tocar este campo, ni viceversa).
 * Solo lo mueve un admin humano desde el panel (ver `helpers/logistics-status.helper.ts` para qué
 * subconjunto aplica según `DeliveryMethod`). `PENDING_PREPARATION` es el default para ambas
 * modalidades.
 */
export enum LogisticsStatus {
  PENDING_PREPARATION = 'pending_preparation',
  IN_PREPARATION = 'in_preparation',
  // Solo envío a domicilio.
  READY_TO_SHIP = 'ready_to_ship',
  DISPATCHED = 'dispatched',
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  DELIVERY_ISSUE = 'delivery_issue',
  // Solo retiro en el local.
  READY_FOR_PICKUP = 'ready_for_pickup',
  PICKED_UP = 'picked_up',
}
