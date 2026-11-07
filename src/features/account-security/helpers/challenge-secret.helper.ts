import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/**
 * Funciones puras (sin DI) para generar y verificar los secretos de un `SecurityChallenge` -
 * mismo criterio que `lockout-tier.helper.ts` (testeable directamente, ver la limitación de
 * Nest 12 ESM documentada en la memoria del proyecto para todo lo que lleva `Repository`).
 *
 * Nunca se persiste el secreto en texto plano - solo `hashSecret(secret, serverSecret)`. El
 * HMAC usa una clave de servidor (`SECURITY_CHALLENGE_SECRET`), no un salt por fila: a
 * diferencia de un hash de contraseña, un código de 6 dígitos no necesita salt para ser seguro
 * contra un volcado de la base - sin la clave de servidor (que nunca vive en la DB), nadie
 * puede derivar ni verificar ningún secreto, por baja que sea su entropía.
 */

/** Código numérico de 6 dígitos (000000-999999), generado con `crypto.randomInt` (CSPRNG). */
export function generateNumericCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Token opaco de alta entropía (256 bits) para links de verificación y autorizaciones. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string, serverSecret: string): string {
  return createHmac('sha256', serverSecret).update(secret).digest('hex');
}

/** Comparación en tiempo constante - evita que el tiempo de respuesta filtre cuántos
 *  caracteres del hash coinciden. */
export function secretMatches(candidate: string, serverSecret: string, storedHash: string): boolean {
  const candidateHash = hashSecret(candidate, serverSecret);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
