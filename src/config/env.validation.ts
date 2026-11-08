import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),

  // Base de datos: sin DATABASE_URL, arranca con el archivo SQLite local de siempre (el caso
  // normal para desarrollo). Con DATABASE_URL seteada (postgresql://...), usa Postgres en su
  // lugar - mismo código, mismas entidades, ver app.module.ts. Esto permite apuntar el backend
  // local a la base de Postgres de producción sin tocar una línea de código, solo esta env var.
  DATABASE_URL: Joi.string().allow('').optional(),
  // Dokploy/Postgres en Docker normalmente no exige TLS (ni para la conexión interna ni para
  // la expuesta por el puerto externo) - por eso el default es false. Ponerlo en true solo si
  // la instancia de Postgres específica lo requiere.
  DATABASE_SSL: Joi.boolean().default(false),

  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('2h'),
  ADMIN_EMAIL: Joi.string().email(),
  ADMIN_PASSWORD: Joi.string().min(8),

  // Opcional: habilita el autocompletado con IA en el form de productos.
  // Sin esto seteado, ese endpoint responde 503 en vez de romper el arranque.
  // `.allow('')`: dotenv parsea "KEY=" (sin valor) como string vacío, no como ausente - sin
  // esto, Joi lo rechaza igual que si fuera un valor inválido en vez de "no configurado".
  OPENROUTER_API_KEY: Joi.string().allow('').optional(),
  DEEPSEEK_MODEL: Joi.string().allow('').optional(),

  // Identificación legal/comercial del titular (ver legal.config.ts). Todas opcionales:
  // sin setearlas, el sitio sigue arrancando y muestra placeholders "[COMPLETAR: ...]"
  // bien visibles en vez de inventar datos o romper el build.
  LEGAL_BUSINESS_NAME: Joi.string().allow('').optional(),
  LEGAL_LEGAL_NAME: Joi.string().allow('').optional(),
  LEGAL_CUIT: Joi.string().allow('').optional(),
  LEGAL_ADDRESS: Joi.string().allow('').optional(),
  LEGAL_PROVINCE: Joi.string().allow('').optional(),
  LEGAL_LOCALITY: Joi.string().allow('').optional(),
  LEGAL_SUPPORT_EMAIL: Joi.string().allow('').optional(),
  LEGAL_WHATSAPP: Joi.string().allow('').optional(),
  LEGAL_BUSINESS_HOURS: Joi.string().allow('').optional(),

  // Feature flag: por defecto (false) NO cambia el comportamiento actual - los vapes
  // sembrados siguen visibles/comprables. Ponerlo en true activa el filtro real que excluye
  // del catálogo público todo producto "vapes" sin saleAuthorizationStatus="autorizado".
  // Ver COMPLIANCE_ARGENTINA.md (riesgo aceptado conscientemente por el titular).
  VAPES_SALE_ENFORCEMENT_ENABLED: Joi.boolean().default(false),

  // Opcional: a dónde se notifica un nuevo trámite de arrepentimiento por email
  // (default: RESEND_FROM_SUPPORT / soporte@essencevapes.com.ar si no se setea).
  WITHDRAWAL_NOTIFICATION_EMAIL: Joi.string().allow('').optional(),

  // Resend (ver resend.config.ts). Sin RESEND_API_KEY seteada, EmailService no rompe nada -
  // solo loguea y no envía, igual que el resto de las integraciones opcionales de este proyecto.
  RESEND_API_KEY: Joi.string().allow('').optional(),
  RESEND_FROM_NO_REPLY: Joi.string().allow('').optional(),
  RESEND_FROM_CONTACT: Joi.string().allow('').optional(),
  RESEND_FROM_SALES: Joi.string().allow('').optional(),
  RESEND_FROM_SUPPORT: Joi.string().allow('').optional(),
  // Opcional: a dónde se notifica un nuevo mensaje de contacto
  // (default: RESEND_FROM_CONTACT / contacto@essencevapes.com.ar si no se setea).
  CONTACT_NOTIFICATION_EMAIL: Joi.string().allow('').optional(),

  // --- Seguridad (ver security.config.ts / BACKEND_SECURITY.md) ---

  // Cantidad de "hops" de reverse proxy confiables delante de Node, para que `request.ip`
  // sea la IP real del cliente y no la del proxy. En esta infra (VPS propia con Dokploy/
  // Traefik, sin Cloudflare) hay exactamente 1 hop confiable.
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(1),

  // CORS_ALLOWED_ORIGINS NO es una env var - está hardcodeado en security.config.ts a
  // propósito. Ver ese archivo si hay que cambiar el dominio del frontend.

  // Rate limiting genérico (@nestjs/throttler) - todos los valores en ms salvo los *_MAX.
  THROTTLE_GLOBAL_MAX: Joi.number().integer().positive().default(100),
  THROTTLE_GLOBAL_TTL_MS: Joi.number().integer().positive().default(60_000),
  THROTTLE_CATALOG_MAX: Joi.number().integer().positive().default(60),
  THROTTLE_CATALOG_TTL_MS: Joi.number().integer().positive().default(60_000),
  THROTTLE_PUBLIC_FORM_MAX: Joi.number().integer().positive().default(5),
  THROTTLE_PUBLIC_FORM_TTL_MS: Joi.number().integer().positive().default(600_000),
  THROTTLE_LOOKUP_MAX: Joi.number().integer().positive().default(20),
  THROTTLE_LOOKUP_TTL_MS: Joi.number().integer().positive().default(900_000),
  THROTTLE_ADMIN_MAX: Joi.number().integer().positive().default(30),
  THROTTLE_ADMIN_TTL_MS: Joi.number().integer().positive().default(60_000),

  // Fuerza bruta de login - independiente por cuenta Y por IP (ver BruteForceService).
  AUTH_MAX_FAILED_ATTEMPTS: Joi.number().integer().positive().default(5),
  AUTH_FAILED_WINDOW_MS: Joi.number().integer().positive().default(900_000),
  AUTH_LOCKOUT_INITIAL_MS: Joi.number().integer().positive().default(300_000),
  AUTH_LOCKOUT_MULTIPLIER: Joi.number().positive().default(3),
  AUTH_LOCKOUT_MAX_MS: Joi.number().integer().positive().default(3_600_000),

  // Bloqueo temporal de IPs por patrones de abuso (401/403/404 reiterados, scraping de
  // rutas admin) - ver AbuseDetectionService. Nunca se dispara con un solo evento.
  ABUSE_SUSPICIOUS_MAX: Joi.number().integer().positive().default(15),
  ABUSE_SUSPICIOUS_WINDOW_MS: Joi.number().integer().positive().default(300_000),
  ABUSE_BLOCK_INITIAL_MS: Joi.number().integer().positive().default(600_000),
  ABUSE_BLOCK_MULTIPLIER: Joi.number().positive().default(3),
  ABUSE_BLOCK_MAX_MS: Joi.number().integer().positive().default(86_400_000),

  SECURITY_LOGGING_ENABLED: Joi.boolean().default(true),

  // --- Verificación de email / recuperación y cambio de contraseña (ver ACCOUNT_SECURITY.md) ---

  // Dominio del frontend para construir los links de los emails (verificación de correo).
  // HTTPS en producción - en dev puede quedar en localhost:4200.
  FRONTEND_URL: Joi.string().uri().default('https://www.essencevapes.com.ar'),

  // Secreto propio para el HMAC de tokens/códigos de seguridad - nunca el mismo que JWT_SECRET
  // (rotación independiente). Requerido como JWT_SECRET, mismo criterio de longitud mínima.
  SECURITY_CHALLENGE_SECRET: Joi.string().min(16).required(),

  EMAIL_VERIFICATION_TOKEN_TTL_MS: Joi.number().integer().positive().default(86_400_000),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS: Joi.number().integer().positive().default(60_000),
  EMAIL_VERIFICATION_RESEND_HOURLY_MAX: Joi.number().integer().positive().default(5),

  PASSWORD_RESET_CODE_TTL_MS: Joi.number().integer().positive().default(600_000),
  PASSWORD_RESET_REQUEST_COOLDOWN_MS: Joi.number().integer().positive().default(60_000),
  PASSWORD_RESET_REQUEST_HOURLY_MAX: Joi.number().integer().positive().default(5),

  PASSWORD_CHANGE_CODE_TTL_MS: Joi.number().integer().positive().default(600_000),
  PASSWORD_CHANGE_REQUEST_COOLDOWN_MS: Joi.number().integer().positive().default(60_000),
  PASSWORD_CHANGE_REQUEST_HOURLY_MAX: Joi.number().integer().positive().default(5),

  SECURITY_AUTHORIZATION_TTL_MS: Joi.number().integer().positive().default(300_000),
  SECURITY_CHALLENGE_MAX_ATTEMPTS: Joi.number().integer().positive().default(5),

  // Chequeo opcional contra HaveIBeenPwned (sin API key, k-anonimato) - fail-open si falla.
  PWNED_PASSWORD_CHECK_ENABLED: Joi.boolean().default(true),
  PWNED_PASSWORD_CHECK_TIMEOUT_MS: Joi.number().integer().positive().default(2_000),
});
