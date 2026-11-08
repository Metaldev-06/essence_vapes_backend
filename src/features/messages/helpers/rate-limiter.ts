/**
 * Limitador de ritmo simple (no de concurrencia) - Resend permite como máximo 10 requests/segundo
 * por cuenta (confirmado en vivo: `503 Too many requests...` al disparar varias llamadas en
 * paralelo desde `listThreads`/`getStats`, que golpean 2-3 bandejas a la vez). Este limitador
 * asegura que ninguna llamada salga antes de que le toque su turno, espaciadas por `1000/maxPerSecond`
 * ms, sin bloquear al resto del backend mientras espera (cada `schedule()` solo demora SU propia
 * llamada, nunca bloquea quien la pidió de forma global).
 *
 * Reserva el turno de forma síncrona (lee y escribe `nextSlotAt` sin ningún `await` en el medio),
 * así que llamadas que llegan "al mismo tiempo" (ej. 3 bandejas en `Promise.all`) obtienen turnos
 * distintos y crecientes sin condición de carrera, sin necesitar un lock real.
 */
export class RateLimiter {
  private nextSlotAt = 0;
  private readonly intervalMs: number;

  constructor(maxPerSecond: number) {
    this.intervalMs = 1000 / maxPerSecond;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const slotAt = Math.max(now, this.nextSlotAt);
    this.nextSlotAt = slotAt + this.intervalMs;

    const delay = slotAt - now;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    return fn();
  }
}
