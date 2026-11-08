import type { Resend, WebhookEventPayload } from 'resend';

export interface SvixHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

/**
 * Verifica la firma Svix de un webhook de Resend contra el payload CRUDO (string, no el objeto
 * ya parseado por un body-parser - re-serializarlo puede dar bytes distintos y romper la firma).
 * Pura excepto por la llamada al SDK, para poder testear el camino feliz/rechazo sin tener que
 * levantar un `Resend` real - ver `webhook-signature.helper.spec.ts`.
 *
 * @returns El payload tipado si la firma es válida, o `null` si es inválida/faltan headers -
 * nunca lanza, para que el controller pueda responder 400 de forma uniforme sin un try/catch.
 */
export function verifyResendWebhook(
  resend: Pick<Resend, 'webhooks'>,
  rawBody: string,
  headers: SvixHeaders,
  webhookSecret: string,
): WebhookEventPayload | null {
  if (!headers.id || !headers.timestamp || !headers.signature) return null;

  try {
    return resend.webhooks.verify({
      payload: rawBody,
      headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature },
      webhookSecret,
    });
  } catch {
    return null;
  }
}
