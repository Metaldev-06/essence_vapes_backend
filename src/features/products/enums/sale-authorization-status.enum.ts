/**
 * Estado de autorización sanitaria/regulatoria de venta de un producto (hoy pensado para
 * "vapes" bajo Disposición ANMAT 2543/2026 y Ley 26.687, pero el campo es genérico). Nunca se
 * asigna "autorizado" automáticamente - lo decide un admin humano con el registro real en mano.
 */
export enum SaleAuthorizationStatus {
  NO_VERIFICADO = 'no_verificado',
  AUTORIZADO = 'autorizado',
  RECHAZADO = 'rechazado',
}
