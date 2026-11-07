import { registerAs } from '@nestjs/config';

/**
 * Verificación de email + recuperación/cambio de contraseña (ver ACCOUNT_SECURITY.md).
 * Mismo criterio que `security.config.ts`: todo con default sensato, nada rompe el arranque
 * por faltar una env var opcional.
 */
export default registerAs('accountSecurity', () => ({
  // Usada para construir los links de los emails (verificación, nunca para los códigos de 6
  // dígitos, que no son links). HTTPS en producción - ver env.validation.ts.
  frontendUrl: process.env.FRONTEND_URL || 'https://www.essencevapes.com.ar',

  emailVerification: {
    tokenTtlMs: Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_MS ?? 86_400_000), // 24h
    resendCooldownMs: Number(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_MS ?? 60_000),
    resendHourlyMax: Number(process.env.EMAIL_VERIFICATION_RESEND_HOURLY_MAX ?? 5),
  },

  passwordReset: {
    codeTtlMs: Number(process.env.PASSWORD_RESET_CODE_TTL_MS ?? 600_000), // 10min
    requestCooldownMs: Number(process.env.PASSWORD_RESET_REQUEST_COOLDOWN_MS ?? 60_000),
    requestHourlyMax: Number(process.env.PASSWORD_RESET_REQUEST_HOURLY_MAX ?? 5),
  },

  passwordChange: {
    codeTtlMs: Number(process.env.PASSWORD_CHANGE_CODE_TTL_MS ?? 600_000), // 10min
    requestCooldownMs: Number(process.env.PASSWORD_CHANGE_REQUEST_COOLDOWN_MS ?? 60_000),
    requestHourlyMax: Number(process.env.PASSWORD_CHANGE_REQUEST_HOURLY_MAX ?? 5),
  },

  // Una vez que el código de 6 dígitos se valida, se cambia por esta autorización de un solo
  // uso para el paso final (reset/confirm) - alcance mucho más corto que el código mismo.
  authorizationTtlMs: Number(process.env.SECURITY_AUTHORIZATION_TTL_MS ?? 300_000), // 5min

  maxAttemptsPerChallenge: Number(process.env.SECURITY_CHALLENGE_MAX_ATTEMPTS ?? 5),

  // Secreto propio para el HMAC de los challenges - deliberadamente separado de JWT_SECRET
  // para poder rotar uno sin invalidar el otro.
  challengeSecret: process.env.SECURITY_CHALLENGE_SECRET,

  // Chequeo best-effort contra HaveIBeenPwned (k-anonimato, sin API key) al establecer una
  // contraseña nueva. Fail-open: si el servicio externo no responde, no bloquea el cambio.
  pwnedPasswordCheck: {
    enabled: process.env.PWNED_PASSWORD_CHECK_ENABLED !== 'false',
    timeoutMs: Number(process.env.PWNED_PASSWORD_CHECK_TIMEOUT_MS ?? 2_000),
  },
}));
