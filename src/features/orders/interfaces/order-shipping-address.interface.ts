/** Snapshot congelado de `Address` (ver `features/addresses`) al momento de crear la orden. */
export interface OrderShippingAddress {
  recipientName: string;
  phone: string;
  street: string;
  streetNumber: string;
  apartment?: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  /** "Entre calles" - distinto de `notes` (referencias generales para encontrar el domicilio). */
  betweenStreets?: string | null;
  notes?: string | null;
}
