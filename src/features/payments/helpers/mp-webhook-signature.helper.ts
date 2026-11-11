import { createHmac, timingSafeEqual } from 'crypto';

export interface MercadoPagoSignatureInput {
  /** Valor de `data.id` en la query string de la notificación. */
  dataId?: string;
  /** Header `x-request-id`. */
  xRequestId?: string;
  /** Header `x-signature` completo, formato `ts=<ms>,v1=<hex>`. */
  xSignature?: string;
  secret: string;
}

/**
 * Valida la firma de un webhook de Mercado Pago - función pura, sin DI (ver
 * `order-totals.helper.ts` para el porqué de este estilo). Algoritmo citado textual de la
 * documentación oficial ("Cómo configurar notificaciones Webhooks" > firma): el manifest es
 * `id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;`, omitiendo cualquier línea
 * cuyo valor de origen no esté presente, firmado con HMAC-SHA256 y comparado en tiempo
 * constante contra el segmento `v1` del header. El secreto sale del panel de la app (Tus
 * integraciones > Webhooks > Firma secreta), nunca del access token.
 */
export const verifyMercadoPagoSignature = (input: MercadoPagoSignatureInput): boolean => {
  const { dataId, xRequestId, xSignature, secret } = input;
  if (!xSignature || !secret) return false;

  const parts = new Map(
    xSignature
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([key, value]) => [key.trim(), value.trim()] as [string, string]),
  );
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1) return false;

  const manifestLines: string[] = [];
  if (dataId) manifestLines.push(`id:${dataId.toLowerCase()};`);
  if (xRequestId) manifestLines.push(`request-id:${xRequestId};`);
  manifestLines.push(`ts:${ts};`);
  const manifest = manifestLines.join('');

  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const receivedBuffer = Buffer.from(v1, 'hex');
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
};
