import { outOfStockLast } from './stock-order.helper';

const row = (id: string, stock: number) => ({ id, stock });

describe('outOfStockLast', () => {
  it('manda al final las que no tienen stock', () => {
    const rows = [row('125ml', 0), row('le-beau', 3), row('born-in-roma', 1), row('200ml', 1)];

    expect(outOfStockLast(rows).map((r) => r.id)).toEqual(['le-beau', 'born-in-roma', '200ml', '125ml']);
  });

  it('respeta el orden elegido dentro de cada grupo', () => {
    // Ej. ya ordenadas por precio: $10, $20 (agotada), $30, $40 (agotada).
    const rows = [row('a', 5), row('b', 0), row('c', 2), row('d', 0)];

    expect(outOfStockLast(rows).map((r) => r.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('un stock negativo (dato inconsistente) también cuenta como agotado', () => {
    expect(outOfStockLast([row('x', -1), row('y', 1)]).map((r) => r.id)).toEqual(['y', 'x']);
  });

  it('no modifica la lista original y tolera listas vacías o sin agotadas', () => {
    const rows = [row('a', 1), row('b', 2)];

    expect(outOfStockLast(rows)).toEqual(rows);
    expect(outOfStockLast(rows)).not.toBe(rows);
    expect(outOfStockLast([])).toEqual([]);
  });
});
