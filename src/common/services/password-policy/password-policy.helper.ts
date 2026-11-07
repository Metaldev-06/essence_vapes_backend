import { createHash } from 'crypto';

/**
 * Lógica pura (sin DI) de `PasswordPolicyService` - separada para poder testearla sin
 * `ConfigService` en el constructor (ver la limitación de Nest 12 ESM documentada en
 * `lockout-tier.helper.ts`/la memoria del proyecto: nada con `ConfigService` como parámetro de
 * constructor se puede instanciar directamente en un test).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordShapeResult {
  valid: boolean;
  message?: string;
}

/** Política moderna: largo mínimo/máximo, sin reglas arbitrarias de símbolos obligatorios. */
export function validatePasswordShape(password: string): PasswordShapeResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, message: `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres` };
  }
  return { valid: true };
}

/** SHA-1 en mayúsculas de la contraseña, partido en prefijo (5 chars, lo que se manda a la API
 *  de HIBP) y sufijo (el resto, para comparar localmente contra cada línea de la respuesta) -
 *  el esquema de k-anonimato: la contraseña real nunca sale del proceso. */
export function computePwnedRangeQuery(password: string): { prefix: string; suffix: string } {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  return { prefix: sha1.slice(0, 5), suffix: sha1.slice(5) };
}

/** Una línea de la respuesta de HIBP es "SUFIJO:conteo" - chequea coincidencia exacta de sufijo. */
export function responseContainsSuffix(responseBody: string, suffix: string): boolean {
  return responseBody
    .split('\n')
    .some((line) => line.trim().toUpperCase().startsWith(`${suffix}:`));
}
