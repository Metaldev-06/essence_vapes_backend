/**
 * `true` si el error es una violación de restricción única, en cualquiera de los dos dialectos
 * del proyecto (Postgres: code `23505`; better-sqlite3: `SQLITE_CONSTRAINT_UNIQUE` / mensaje
 * "UNIQUE constraint failed"). Acá NO es un error a reportar: es la señal de que otra ejecución
 * concurrente ya insertó la misma notificación (mismo `dedupeKey`), que es justo lo que el
 * índice único existe para frenar.
 */
export function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string; driverError?: { code?: string } };
  const code = candidate?.driverError?.code ?? candidate?.code;
  if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return true;
  }
  return typeof candidate?.message === 'string' && candidate.message.includes('UNIQUE constraint failed');
}
