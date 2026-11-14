import { registerAs } from '@nestjs/config';

/**
 * Notificaciones administrativas. Las tres claves VAPID son opcionales a nivel de arranque
 * (mismo criterio que Resend / Mercado Pago / OpenRouter): sin ellas el backend levanta igual y
 * el canal Web Push simplemente queda apagado - el panel y el email siguen funcionando.
 *
 * Generar el par una sola vez con `npx web-push generate-vapid-keys` (ver NOTIFICATIONS.md).
 * La clave privada nunca se loguea ni se expone por ningún endpoint; la pública sí viaja al
 * navegador (es lo que el navegador necesita para suscribirse).
 */
export default registerAs('notifications', () => {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || undefined;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || undefined;

  return {
    vapidPublicKey,
    vapidPrivateKey,
    // Contacto que el servicio de push del navegador usa si necesita avisar de un problema con
    // este emisor - exigido por la especificación VAPID (un `mailto:` o una URL https).
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:soporte@essencevapes.com.ar',
    pushEnabled: Boolean(vapidPublicKey && vapidPrivateKey),
    // Reintentos de una entrega (push/email) antes de darla por fallida definitivamente.
    deliveryMaxAttempts: Number(process.env.NOTIFICATIONS_DELIVERY_MAX_ATTEMPTS ?? 5),
  };
});
