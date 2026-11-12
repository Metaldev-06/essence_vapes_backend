/**
 * Traduce el `status_detail` que devuelve Mercado Pago para un pago con tarjeta rechazado a un
 * mensaje en español accionable para el comprador - antes de esto se le mostraba (en el email y
 * en la pantalla de resultado) el código crudo de MP tal cual (ej.
 * "cc_rejected_bad_filled_security_code"), que no le dice nada a un comprador real.
 *
 * Cubre los 6 motivos de rechazo del propio simulador de tarjetas de prueba de MP (OTHE, CALL,
 * FUND, SECU, EXPI, FORM) más otros códigos de rechazo de tarjeta igual de públicos/documentados
 * que podrían darse en producción real aunque no estén en ese simulador. Función pura, sin DI -
 * mismo criterio que el resto de los helpers de este módulo (ver `mp-status-mapper.helper.ts`).
 */
const STATUS_DETAIL_LABELS: Record<string, string> = {
  // OTHE - "Rechazado por error general"
  cc_rejected_other_reason:
    'Rechazado por un error general del medio de pago. Probá con otra tarjeta.',
  // CALL - "Rechazado con validación para autorizar"
  cc_rejected_call_for_authorize:
    'Tu tarjeta necesita autorización de tu banco para esta compra. Comunicate con tu entidad bancaria o probá con otra tarjeta.',
  // FUND - "Rechazado por importe insuficiente"
  cc_rejected_insufficient_amount:
    'Fondos insuficientes en la tarjeta. Probá con otra tarjeta o medio de pago.',
  // SECU - "Rechazado por código de seguridad inválido"
  cc_rejected_bad_filled_security_code:
    'El código de seguridad (CVV) no es correcto. Revisalo y probá de nuevo.',
  // EXPI - "Rechazado debido a un problema de fecha de vencimiento"
  cc_rejected_bad_filled_date:
    'La fecha de vencimiento de la tarjeta no es correcta. Revisala y probá de nuevo.',
  // FORM - "Rechazado debido a un error de formulario"
  cc_rejected_bad_filled_other:
    'Algún dato de la tarjeta no es correcto. Revisá los datos ingresados y probá de nuevo.',
  // No está en el simulador de MP, pero es el mismo tipo de error de formulario que FORM/SECU.
  cc_rejected_bad_filled_card_number:
    'El número de tarjeta no es correcto. Revisalo y probá de nuevo.',
  cc_rejected_blacklist: 'La tarjeta fue rechazada por el medio de pago. Probá con otra tarjeta.',
  cc_rejected_card_disabled:
    'La tarjeta está deshabilitada. Comunicate con tu banco o probá con otra tarjeta.',
  cc_rejected_duplicated_payment:
    'Ya existe un pago igual reciente. Si necesitás pagar de nuevo, esperá unos minutos o probá con otra tarjeta.',
  cc_rejected_high_risk: 'El pago fue rechazado por el medio de pago. Probá con otra tarjeta.',
  cc_rejected_max_attempts:
    'Alcanzaste el límite de intentos para esta compra. Probá con otra tarjeta.',
};

/** `null` si no hay `statusDetail` - un código no mapeado cae a un mensaje genérico (nunca se
 *  muestra el string crudo de MP). */
export const statusDetailLabel = (statusDetail?: string | null): string | null => {
  if (!statusDetail) return null;
  return (
    STATUS_DETAIL_LABELS[statusDetail] ??
    'No pudimos validar el pago con tu tarjeta. Probá con otra tarjeta o medio de pago.'
  );
};
