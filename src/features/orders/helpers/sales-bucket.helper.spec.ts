import { bucketStart } from './sales-bucket.helper';

describe('bucketStart', () => {
  it('day - agrupa por día calendario de Buenos Aires', () => {
    // 2026-11-12 23:50 BA = 2026-11-13T02:50:00Z (ya pasó la medianoche UTC, pero en BA sigue
    // siendo el 12).
    const date = new Date('2026-11-13T02:50:00.000Z');
    expect(bucketStart(date, 'day').toISOString()).toBe('2026-11-12T03:00:00.000Z');
  });

  it('month - agrupa por mes calendario de Buenos Aires', () => {
    const date = new Date('2026-11-20T18:00:00.000Z');
    expect(bucketStart(date, 'month').toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('month - fin de mes en BA no se corre al mes siguiente por el offset UTC', () => {
    // 2026-11-30 23:00 BA = 2026-12-01T02:00:00Z - en UTC ya es diciembre, pero en BA sigue
    // siendo noviembre.
    const date = new Date('2026-12-01T02:00:00.000Z');
    expect(bucketStart(date, 'month').toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });

  it('week - un miércoles cae en el lunes de esa semana', () => {
    // 2026-11-11 es miércoles.
    const date = new Date('2026-11-11T15:00:00.000Z');
    expect(bucketStart(date, 'week').toISOString()).toBe('2026-11-09T03:00:00.000Z');
  });

  it('week - un lunes es el inicio de su propia semana', () => {
    // 2026-11-09 es lunes.
    const date = new Date('2026-11-09T12:00:00.000Z');
    expect(bucketStart(date, 'week').toISOString()).toBe('2026-11-09T03:00:00.000Z');
  });

  it('week - un domingo cae en el lunes anterior, cruzando de mes', () => {
    // 2026-11-01 es domingo -> el lunes anterior es 2026-10-26.
    const date = new Date('2026-11-01T12:00:00.000Z');
    expect(bucketStart(date, 'week').toISOString()).toBe('2026-10-26T03:00:00.000Z');
  });
});
