import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('ejecuta una sola llamada inmediatamente (sin demora)', async () => {
    const limiter = new RateLimiter(10);
    const start = Date.now();
    const result = await limiter.schedule(async () => 'ok');
    expect(result).toBe('ok');
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('espacía llamadas concurrentes según el máximo por segundo', async () => {
    const limiter = new RateLimiter(20); // 50ms entre turnos, test rápido
    const start = Date.now();
    const timestamps: number[] = [];

    await Promise.all(
      Array.from({ length: 4 }, () =>
        limiter.schedule(async () => {
          timestamps.push(Date.now() - start);
        }),
      ),
    );

    timestamps.sort((a, b) => a - b);
    // Cada turno debe estar separado del anterior por al menos ~45ms (tolerancia por timers).
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] - timestamps[i - 1]).toBeGreaterThanOrEqual(45);
    }
  });

  it('no bloquea llamadas entre sí mientras una tarda en resolver', async () => {
    const limiter = new RateLimiter(100); // 10ms entre turnos
    const order: string[] = [];

    const slow = limiter.schedule(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      order.push('slow');
    });
    const fast = limiter.schedule(async () => {
      order.push('fast');
    });

    await Promise.all([slow, fast]);
    // "fast" se dispara después de "slow" (sigue el orden de turnos), pero resuelve primero
    // porque no espera a que "slow" termine - solo a que le toque su turno de salida.
    expect(order).toEqual(['fast', 'slow']);
  });
});
