/**
 * Mismos valores que devuelve Mercado Pago (Orders API, nivel de transacción) tras mapear su
 * nomenclatura propia (`processed`/`action_required`/...) a través de
 * `helpers/mp-status-mapper.helper.ts` - ver ese archivo para la tabla de equivalencias exacta
 * citada de la documentación oficial. `CHARGED_BACK` llega solo vía webhook de contracargo.
 */
export enum PaymentStatus {
  PENDING = 'pending',
  IN_PROCESS = 'in_process',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  CHARGED_BACK = 'charged_back',
}
