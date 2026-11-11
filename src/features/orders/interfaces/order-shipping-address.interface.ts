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
  notes?: string | null;
}
