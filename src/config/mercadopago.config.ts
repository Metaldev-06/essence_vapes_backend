import { registerAs } from '@nestjs/config';

/**
 * Credenciales de Mercado Pago (Checkout API, Orders). Todas opcionales a nivel de arranque -
 * sin ACCESS_TOKEN/PUBLIC_KEY seteadas, `MercadoPagoService` no rompe el boot, pero cualquier
 * intento real de crear un pago responde 503 (mismo criterio que OPENROUTER_API_KEY). Nunca
 * loguear `accessToken`/`webhookSecret` completos - ver `common/helpers/logger.helper.ts`.
 */
export default registerAs('mercadopago', () => ({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || undefined,
  publicKey: process.env.MERCADOPAGO_PUBLIC_KEY || undefined,
  // Firma secreta del panel de la app (Tus integraciones > Webhooks > Firma secreta) - distinta
  // del access token, usada solo para validar `X-Signature` en PaymentsWebhookController.
  webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET || undefined,
  // 'sandbox' (default) usa credenciales TEST- / APP_USR- de prueba sin mover dinero real;
  // 'production' es un valor puramente informativo acá (la API real de MP no distingue
  // "ambiente" por URL, lo determina el prefijo de la credencial) - sirve para que el resto del
  // código (ej. logs, banner de admin) pueda avisar claramente en qué modo está corriendo.
  environment: process.env.MERCADOPAGO_ENVIRONMENT || 'sandbox',
  apiBaseUrl: 'https://api.mercadopago.com',
  // Ventana de reserva de stock de una orden en estado pending_payment antes de liberarse
  // automáticamente (ver OrdersExpirationService). 30 min por defecto.
  orderExpirationMs: Number(process.env.MERCADOPAGO_ORDER_EXPIRATION_MS ?? 30 * 60 * 1000),
}));
