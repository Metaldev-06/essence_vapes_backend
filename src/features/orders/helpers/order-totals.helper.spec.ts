import { computeOrderTotals } from './order-totals.helper';

describe('computeOrderTotals', () => {
  it('calcula el total de cada línea y la suma general', () => {
    const result = computeOrderTotals([
      { productId: 'p1', variantId: 'base', productName: 'A', variantLabel: null, unitPriceValue: 1000, quantity: 2 },
      { productId: 'p2', variantId: 'v1', productName: 'B', variantLabel: '5ml', unitPriceValue: 500, quantity: 3 },
    ]);

    expect(result.lines[0].lineTotalValue).toBe(2000);
    expect(result.lines[1].lineTotalValue).toBe(1500);
    expect(result.subtotalValue).toBe(3500);
    // Hoy no existe costo de envío: el total siempre es igual al subtotal.
    expect(result.totalValue).toBe(3500);
  });

  it('nunca confía en un total externo - siempre recalcula desde las líneas', () => {
    const result = computeOrderTotals([
      { productId: 'p1', variantId: 'base', productName: 'A', variantLabel: null, unitPriceValue: 100, quantity: 1 },
    ]);
    expect(result.subtotalValue).toBe(100);
  });

  it('devuelve 0 para un carrito vacío', () => {
    const result = computeOrderTotals([]);
    expect(result.subtotalValue).toBe(0);
    expect(result.totalValue).toBe(0);
    expect(result.lines).toHaveLength(0);
  });
});
