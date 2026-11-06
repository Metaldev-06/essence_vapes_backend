import { registerAs } from '@nestjs/config';

/**
 * Orígenes permitidos por CORS - hardcodeado a propósito (no por env var): a diferencia del
 * resto de esta config, cambiar el dominio del frontend es un cambio de código real, no algo
 * que deba poder tocarse sin pasar por un commit/deploy. Nunca poner "*" acá. El header
 * `Origin` que manda el navegador NUNCA termina en "/" - no agregar barra final a ninguno.
 */
const CORS_ALLOWED_ORIGINS: string[] = [
  'http://localhost:4200',
  'https://www.essencevapes.com.ar',
  'https://essencevapes.com.ar',
];

/** Fuente única de toda la config de seguridad - ver BACKEND_SECURITY.md para el detalle. */
export default registerAs('security', () => ({
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  corsAllowedOrigins: CORS_ALLOWED_ORIGINS,

  throttle: {
    globalMax: Number(process.env.THROTTLE_GLOBAL_MAX ?? 100),
    globalTtlMs: Number(process.env.THROTTLE_GLOBAL_TTL_MS ?? 60_000),
    catalogMax: Number(process.env.THROTTLE_CATALOG_MAX ?? 60),
    catalogTtlMs: Number(process.env.THROTTLE_CATALOG_TTL_MS ?? 60_000),
    publicFormMax: Number(process.env.THROTTLE_PUBLIC_FORM_MAX ?? 5),
    publicFormTtlMs: Number(process.env.THROTTLE_PUBLIC_FORM_TTL_MS ?? 600_000),
    lookupMax: Number(process.env.THROTTLE_LOOKUP_MAX ?? 20),
    lookupTtlMs: Number(process.env.THROTTLE_LOOKUP_TTL_MS ?? 900_000),
    adminMax: Number(process.env.THROTTLE_ADMIN_MAX ?? 30),
    adminTtlMs: Number(process.env.THROTTLE_ADMIN_TTL_MS ?? 60_000),
  },

  bruteForce: {
    maxFailedAttempts: Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 5),
    failedWindowMs: Number(process.env.AUTH_FAILED_WINDOW_MS ?? 900_000),
    lockoutInitialMs: Number(process.env.AUTH_LOCKOUT_INITIAL_MS ?? 300_000),
    lockoutMultiplier: Number(process.env.AUTH_LOCKOUT_MULTIPLIER ?? 3),
    lockoutMaxMs: Number(process.env.AUTH_LOCKOUT_MAX_MS ?? 3_600_000),
  },

  abuse: {
    suspiciousMax: Number(process.env.ABUSE_SUSPICIOUS_MAX ?? 15),
    suspiciousWindowMs: Number(
      process.env.ABUSE_SUSPICIOUS_WINDOW_MS ?? 300_000,
    ),
    blockInitialMs: Number(process.env.ABUSE_BLOCK_INITIAL_MS ?? 600_000),
    blockMultiplier: Number(process.env.ABUSE_BLOCK_MULTIPLIER ?? 3),
    blockMaxMs: Number(process.env.ABUSE_BLOCK_MAX_MS ?? 86_400_000),
  },

  loggingEnabled: process.env.SECURITY_LOGGING_ENABLED !== 'false',
}));
