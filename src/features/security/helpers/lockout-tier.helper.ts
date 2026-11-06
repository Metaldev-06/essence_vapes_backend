/**
 * `min(initial * multiplier^tier, max)` - la progresión (5min → 15min → 45min → tope 1h con
 * los defaults) que usan tanto `BruteForceService` como `AbuseDetectionService` para escalar
 * bloqueos temporales. Pura y sin DI a propósito, para poder testearla sin depender de
 * TypeORM/ConfigService reales.
 */
export function computeLockoutDurationMs(
  tier: number,
  initialMs: number,
  multiplier: number,
  maxMs: number,
): number {
  return Math.min(initialMs * Math.pow(multiplier, tier), maxMs);
}
