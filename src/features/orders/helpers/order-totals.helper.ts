export interface OrderableLine {
  productId: string;
  variantId: string;
  productName: string;
  /** `Product.category` al momento de la venta - opcional solo para no romper tests existentes
   *  que no la necesitan; quien crea la orden real siempre la pasa (ver `OrdersService`). */
  category?: string;
  variantLabel: string | null;
  unitPriceValue: number;
  quantity: number;
}

export interface OrderLineTotal extends OrderableLine {
  lineTotalValue: number;
}

export interface OrderTotals {
  lines: OrderLineTotal[];
  subtotalValue: number;
  totalValue: number;
}

/**
 * Único lugar que calcula montos de una orden - función pura, sin DI, para poder testearla
 * directamente (ver la limitación de testing de Nest 11/TypeORM documentada en
 * `lockout-tier.helper.ts`). Nunca recibe un precio del cliente: quien la llama ya tuvo que
 * resolver `unitPriceValue` contra `Product`/`ProductVariant` en vivo. Hoy `totalValue ===
 * subtotalValue` - no existe costo de envío todavía (ver `Order` entity).
 */
export const computeOrderTotals = (lines: OrderableLine[]): OrderTotals => {
  const withTotals = lines.map((line) => ({
    ...line,
    lineTotalValue: line.unitPriceValue * line.quantity,
  }));

  const subtotalValue = withTotals.reduce((sum, line) => sum + line.lineTotalValue, 0);

  return { lines: withTotals, subtotalValue, totalValue: subtotalValue };
};
