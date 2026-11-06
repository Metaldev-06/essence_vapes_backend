import { registerAs } from '@nestjs/config';

/** Fuente única de toda la config de seguridad - ver BACKEND_SECURITY.md para el detalle. */
export default registerAs('security', () => ({
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  // `||` (no `??`) a propósito: un `CORS_ALLOWED_ORIGINS=` vacío en el .env debe caer al
  // default igual que si no estuviera seteado, nunca resolver a un array vacío (eso
  // bloquearía TODOS los orígenes en silencio). También se le quita la barra final a cada
  // origen - el header `Origin` que manda el navegador NUNCA la incluye, así que
  // "https://sitio.com/" jamás matchearía y rompería CORS en silencio por un typo común.
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),

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
    suspiciousWindowMs: Number(process.env.ABUSE_SUSPICIOUS_WINDOW_MS ?? 300_000),
    blockInitialMs: Number(process.env.ABUSE_BLOCK_INITIAL_MS ?? 600_000),
    blockMultiplier: Number(process.env.ABUSE_BLOCK_MULTIPLIER ?? 3),
    blockMaxMs: Number(process.env.ABUSE_BLOCK_MAX_MS ?? 86_400_000),
  },

  loggingEnabled: process.env.SECURITY_LOGGING_ENABLED !== 'false',
}));
