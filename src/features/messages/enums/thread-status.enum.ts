/**
 * Estado interno de atención del CRM - independiente del `read`/`folder` que ya maneja Resend
 * (un mensaje leído no implica resuelto). Vive 100% local, Resend no tiene este concepto.
 */
export enum ThreadStatus {
  NUEVO = 'nuevo',
  PENDIENTE = 'pendiente',
  EN_PROCESO = 'en_proceso',
  ESPERANDO_CLIENTE = 'esperando_cliente',
  RESUELTO = 'resuelto',
  CERRADO = 'cerrado',
}

export const THREAD_STATUS_LABELS: Record<ThreadStatus, string> = {
  [ThreadStatus.NUEVO]: 'Nuevo',
  [ThreadStatus.PENDIENTE]: 'Pendiente',
  [ThreadStatus.EN_PROCESO]: 'En proceso',
  [ThreadStatus.ESPERANDO_CLIENTE]: 'Esperando cliente',
  [ThreadStatus.RESUELTO]: 'Resuelto',
  [ThreadStatus.CERRADO]: 'Cerrado',
};
