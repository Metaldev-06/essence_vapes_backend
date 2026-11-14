const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARGENTINA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

export interface ArgentinaClock {
  /** `YYYY-MM-DD` en hora de Argentina. */
  readonly dateKey: string;
  readonly hour: number;
  readonly minutesOfDay: number;
  /** 0 = domingo ... 6 = sábado. */
  readonly weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Reloj de pared de Argentina para un instante dado - el servidor puede correr en UTC, pero el
 *  horario de silencio y la hora del resumen son siempre hora local del negocio. */
export function argentinaClock(date: Date): ArgentinaClock {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    minutesOfDay: hour * 60 + minute,
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

export interface QuietHoursSettings {
  readonly quietHoursEnabled: boolean;
  readonly quietHoursStart: number;
  readonly quietHoursEnd: number;
}

/**
 * `true` si `now` cae dentro del horario de silencio. Soporta rangos que cruzan la medianoche
 * (22:00 -> 08:00). Inicio y fin iguales = rango vacío (nunca silencia), no "todo el día".
 */
export function isWithinQuietHours(
  settings: QuietHoursSettings | null | undefined,
  now: Date,
): boolean {
  if (!settings?.quietHoursEnabled) return false;
  const { quietHoursStart: start, quietHoursEnd: end } = settings;
  if (start === end) return false;

  const minutes = argentinaClock(now).minutesOfDay;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARGENTINA_TZ,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Fecha corta en hora de Argentina para el cuerpo de una notificación (ej. "14/11, 09:30"). */
export const formatArgentinaDateTime = (date: Date): string => dateTimeFormatter.format(date);
