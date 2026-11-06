import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('2h'),
  ADMIN_EMAIL: Joi.string().email(),
  ADMIN_PASSWORD: Joi.string().min(8),

  // Opcional: habilita el autocompletado con IA en el form de productos.
  // Sin esto seteado, ese endpoint responde 503 en vez de romper el arranque.
  OPENROUTER_API_KEY: Joi.string().optional(),
  DEEPSEEK_MODEL: Joi.string().optional(),

  // Identificación legal/comercial del titular (ver legal.config.ts). Todas opcionales:
  // sin setearlas, el sitio sigue arrancando y muestra placeholders "[COMPLETAR: ...]"
  // bien visibles en vez de inventar datos o romper el build.
  LEGAL_BUSINESS_NAME: Joi.string().optional(),
  LEGAL_LEGAL_NAME: Joi.string().optional(),
  LEGAL_CUIT: Joi.string().optional(),
  LEGAL_ADDRESS: Joi.string().optional(),
  LEGAL_PROVINCE: Joi.string().optional(),
  LEGAL_LOCALITY: Joi.string().optional(),
  LEGAL_SUPPORT_EMAIL: Joi.string().optional(),
  LEGAL_WHATSAPP: Joi.string().optional(),
  LEGAL_BUSINESS_HOURS: Joi.string().optional(),

  // Feature flag: por defecto (false) NO cambia el comportamiento actual - los vapes
  // sembrados siguen visibles/comprables. Ponerlo en true activa el filtro real que excluye
  // del catálogo público todo producto "vapes" sin saleAuthorizationStatus="autorizado".
  // Ver COMPLIANCE_ARGENTINA.md (riesgo aceptado conscientemente por el titular).
  VAPES_SALE_ENFORCEMENT_ENABLED: Joi.boolean().default(false),

  // Opcional: a dónde se notifica un nuevo trámite de arrepentimiento por email
  // (default: RESEND_FROM_SUPPORT / soporte@essencevapes.com.ar si no se setea).
  WITHDRAWAL_NOTIFICATION_EMAIL: Joi.string().optional(),

  // Resend (ver resend.config.ts). Sin RESEND_API_KEY seteada, EmailService no rompe nada -
  // solo loguea y no envía, igual que el resto de las integraciones opcionales de este proyecto.
  RESEND_API_KEY: Joi.string().optional(),
  RESEND_FROM_NO_REPLY: Joi.string().optional(),
  RESEND_FROM_CONTACT: Joi.string().optional(),
  RESEND_FROM_SALES: Joi.string().optional(),
  RESEND_FROM_SUPPORT: Joi.string().optional(),
  // Opcional: a dónde se notifica un nuevo mensaje de contacto
  // (default: RESEND_FROM_CONTACT / contacto@essencevapes.com.ar si no se setea).
  CONTACT_NOTIFICATION_EMAIL: Joi.string().optional(),
});
