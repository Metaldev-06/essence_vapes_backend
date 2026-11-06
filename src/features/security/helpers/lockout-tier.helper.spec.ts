import { describe, expect, it } from '@jest/globals';

import { computeLockoutDurationMs } from './lockout-tier.helper';

describe('computeLockoutDurationMs', () => {
  const INITIAL_MS = 5 * 60 * 1000; // 5 min
  const MULTIPLIER = 3;
  const MAX_MS = 60 * 60 * 1000; // 1h

  it('tier 0 usa la duración inicial', () => {
    expect(computeLockoutDurationMs(0, INITIAL_MS, MULTIPLIER, MAX_MS)).toBe(5 * 60 * 1000);
  });

  it('escala con cada reincidencia (5min -> 15min -> 45min)', () => {
    expect(computeLockoutDurationMs(1, INITIAL_MS, MULTIPLIER, MAX_MS)).toBe(15 * 60 * 1000);
    expect(computeLockoutDurationMs(2, INITIAL_MS, MULTIPLIER, MAX_MS)).toBe(45 * 60 * 1000);
  });

  it('nunca supera el tope configurado (abuso persistente queda capado, no crece sin límite)', () => {
    expect(computeLockoutDurationMs(3, INITIAL_MS, MULTIPLIER, MAX_MS)).toBe(MAX_MS);
    expect(computeLockoutDurationMs(10, INITIAL_MS, MULTIPLIER, MAX_MS)).toBe(MAX_MS);
    expect(computeLockoutDurationMs(100, INITIAL_MS, MULTIPLIER, MAX_MS)).toBe(MAX_MS);
  });
});
