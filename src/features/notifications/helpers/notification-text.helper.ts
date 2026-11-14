const TITLE_MAX = 140;
const BODY_MAX = 500;
const ERROR_MAX = 240;

/**
 * Deja un texto apto para guardarse y mostrarse como notificación: sin caracteres de control,
 * sin etiquetas HTML, espacios colapsados y longitud acotada. El panel (Angular) y los emails
 * (`escapeHtml`) escapan al renderizar - esto es defensa en profundidad para que un nombre de
 * producto o un mensaje de error externo nunca llegue "crudo" a una notificación push.
 */
function clean(value: string, max: number): string {
  const text = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export const sanitizeTitle = (value: string): string => clean(value, TITLE_MAX);
export const sanitizeBody = (value: string): string => clean(value, BODY_MAX);

const SECRET_PATTERNS: readonly RegExp[] = [
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /(APP_USR|TEST)-[a-z0-9-]{8,}/gi,
  /\bre_[a-z0-9_]{8,}/gi,
  /eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{5,}/gi,
  /(password|token|secret|api[_-]?key|authorization)["'\s:=]+[^\s"',;]+/gi,
  /postgres(ql)?:\/\/\S+/gi,
];

/**
 * Para mensajes de error de terceros (Mercado Pago, Resend, el servicio de push, la base) antes
 * de guardarlos o mostrarlos: enmascara cualquier cosa con forma de credencial y trunca.
 */
export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const masked = SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[oculto]'), raw);
  return clean(masked, ERROR_MAX);
}

/** Mismo formato corto que usa el panel para identificar un pedido (`order.id.slice(0, 8)`). */
export const shortOrderId = (orderId: string): string => orderId.slice(0, 8);
