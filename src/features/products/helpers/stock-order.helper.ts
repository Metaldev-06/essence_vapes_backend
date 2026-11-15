/**
 * Manda al final las filas sin stock, conservando dentro de cada grupo el orden que ya traían
 * (destacados, precio, nombre...). Se aplica ANTES de paginar: así las agotadas quedan en las
 * últimas páginas del catálogo y no intercaladas entre las disponibles.
 */
export function outOfStockLast<T extends { stock: number }>(rows: readonly T[]): T[] {
  return [...rows.filter((row) => row.stock > 0), ...rows.filter((row) => row.stock <= 0)];
}
