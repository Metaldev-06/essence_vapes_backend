import { registerAs } from '@nestjs/config';

/**
 * Direcciones reales del negocio en Resend - cada una con un propósito distinto, no
 * intercambiables entre sí:
 * - no-reply: notificaciones automáticas (nadie espera una respuesta).
 * - contacto: lo que entra/sale por el formulario de contacto.
 * - ventas: confirmaciones de consultas o solicitudes (ej. arrepentimiento).
 * - soporte: atención al cliente / destino por defecto de alertas internas.
 */
export default registerAs('resend', () => ({
  apiKey: process.env.RESEND_API_KEY,
  fromNoReply: process.env.RESEND_FROM_NO_REPLY || 'no-reply@essencevapes.com.ar',
  fromContact: process.env.RESEND_FROM_CONTACT || 'contacto@essencevapes.com.ar',
  fromSales: process.env.RESEND_FROM_SALES || 'ventas@essencevapes.com.ar',
  fromSupport: process.env.RESEND_FROM_SUPPORT || 'soporte@essencevapes.com.ar',
  // A dónde llegan las alertas internas (nuevo contacto, nuevo arrepentimiento) si no se
  // sobreescribe con CONTACT_NOTIFICATION_EMAIL / WITHDRAWAL_NOTIFICATION_EMAIL.
  supportInboxEmail:
    process.env.WITHDRAWAL_NOTIFICATION_EMAIL ||
    process.env.RESEND_FROM_SUPPORT ||
    'soporte@essencevapes.com.ar',
  contactInboxEmail:
    process.env.CONTACT_NOTIFICATION_EMAIL ||
    process.env.RESEND_FROM_CONTACT ||
    'contacto@essencevapes.com.ar',
}));
