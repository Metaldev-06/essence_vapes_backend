import { randomUUID } from 'crypto';

/** Código de gestión legible, p. ej. "AR-20261106-9F3C2A" - identificador, no un secreto. */
export function generateTrackingCode(): string {
  const now = new Date();
  const yyyymmdd = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `AR-${yyyymmdd}-${suffix}`;
}
