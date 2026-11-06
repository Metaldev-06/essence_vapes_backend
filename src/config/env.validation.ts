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

  // Opcional: a dónde debería notificarse un nuevo trámite de arrepentimiento por email.
  // Hoy no se envía ningún email (no hay librería de correo instalada) - el seguimiento
  // real es el panel admin. Dejar esto seteado no activa nada por sí solo.
  WITHDRAWAL_NOTIFICATION_EMAIL: Joi.string().optional(),
});
