/**
 * El proyecto guarda el nombre del comprador como un solo campo (`buyerName`) pero la Orders
 * API de Mercado Pago quiere `first_name`/`last_name` separados (checklist de calidad oficial) -
 * función pura, sin DI (ver `order-totals.helper.ts`). Heurística simple: la primera palabra es
 * el nombre, el resto el apellido; si no hay espacio, todo va a `firstName` y `lastName` queda
 * vacío en vez de inventar un apellido que no existe.
 */
export interface SplitName {
  firstName: string;
  lastName: string;
}

export const splitFullName = (fullName: string): SplitName => {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
};
