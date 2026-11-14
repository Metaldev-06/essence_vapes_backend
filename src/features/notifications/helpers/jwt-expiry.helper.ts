/**
 * Lee el `exp` (en ms) de un header `Authorization: Bearer <jwt>` SIN verificar la firma - solo
 * se usa para saber cuándo cortar un stream SSE ya abierto. La autenticación real ya la hizo
 * `@Auth()` (passport-jwt) antes de llegar acá; esto nunca decide si alguien tiene acceso.
 */
export function readBearerExpiryMs(authorization: string | undefined): number | null {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  const payloadSegment = token?.split('.')[1];
  if (!payloadSegment) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
