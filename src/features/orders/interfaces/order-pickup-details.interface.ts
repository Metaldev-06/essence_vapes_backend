/** Snapshot de quién retira un pedido con `deliveryMethod = PICKUP` (ver `Order.pickupDetails`). */
export interface OrderPickupDetails {
  contactName: string;
  phone: string;
  notes?: string | null;
}
