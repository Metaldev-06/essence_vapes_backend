/**
 * Agrupa fechas en buckets de día/semana/mes en hora de Buenos Aires, para el gráfico de
 * evolución de ventas (ver tarea, punto 3.3) - sin depender de funciones de fecha específicas de
 * Postgres (`date_trunc`), para que el mismo código corra igual contra SQLite en
 * desarrollo/tests. Argentina no aplica horario de verano desde 2009 (UTC-3 fijo todo el año),
 * así que alcanza con un offset constante - mismo criterio que `date-range.model.ts` del frontend.
 */

export type SalesBucketGranularity = 'day' | 'week' | 'month';

const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const toBuenosAiresParts = (date: Date): { year: number; month: number; day: number } => {
  const shifted = new Date(date.getTime() - AR_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
};

const buenosAiresMidnightUtc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month, day, 0, 0, 0, 0) + AR_OFFSET_MS);

/** Instante UTC del inicio (hora de Buenos Aires) del bucket al que pertenece `date`. La semana
 *  empieza el lunes. */
export const bucketStart = (date: Date, granularity: SalesBucketGranularity): Date => {
  const { year, month, day } = toBuenosAiresParts(date);
  if (granularity === 'month') return buenosAiresMidnightUtc(year, month, 1);

  const dayStart = buenosAiresMidnightUtc(year, month, day);
  if (granularity === 'day') return dayStart;

  // getUTCDay() sobre la medianoche de BA (expresada en UTC) da el día de semana real en BA: 0
  // domingo..6 sábado -> lo corremos para que 0 sea lunes.
  const daysSinceMonday = (dayStart.getUTCDay() + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
};
