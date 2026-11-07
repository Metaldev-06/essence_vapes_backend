import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerHelper } from '../../helpers/logger.helper';
import { computePwnedRangeQuery, responseContainsSuffix, validatePasswordShape } from './password-policy.helper';

const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Política moderna para la contraseña NUEVA que se establece vía "olvidé mi contraseña" o
 * "cambiar contraseña" (Fases 2.5/4 del brief) - deliberadamente NO se aplica a
 * `RegisterUserDto`/`LoginUserDto` (esos ya tienen su propia regla, fuera de alcance de esta
 * tarea). Acepta frases largas, no exige símbolos/mayúsculas obligatorias. La lógica de forma
 * vive en `password-policy.helper.ts` (función pura, testeable sin `ConfigService`).
 */
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly configService: ConfigService) {}

  /** Lanza `BadRequestException` si la contraseña no cumple el largo mínimo/máximo. Nunca
   *  trunca en silencio - rechaza explícitamente lo que no entra. */
  assertValidShape(password: string): void {
    const result = validatePasswordShape(password);
    if (!result.valid) throw new BadRequestException(result.message);
  }

  /**
   * Best-effort contra la API pública de HaveIBeenPwned (k-anonimato: solo se manda el prefijo
   * de 5 caracteres del hash SHA-1, nunca la contraseña ni el hash completo). Fail-open: si el
   * servicio no responde a tiempo o falla, no bloquea el cambio - no depender de la
   * disponibilidad de un tercero para una operación de seguridad propia.
   */
  async isKnownBreached(password: string): Promise<boolean> {
    if (!this.configService.get<boolean>('accountSecurity.pwnedPasswordCheck.enabled')) {
      return false;
    }

    const { prefix, suffix } = computePwnedRangeQuery(password);
    const timeoutMs = this.configService.get<number>(
      'accountSecurity.pwnedPasswordCheck.timeoutMs',
    )!;

    try {
      const res = await fetch(`${PWNED_RANGE_URL}${prefix}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Add-Padding': 'true' },
      });
      if (!res.ok) return false;

      const body = await res.text();
      return responseContainsSuffix(body, suffix);
    } catch (err) {
      LoggerHelper(
        `No se pudo consultar HaveIBeenPwned (fail-open, no bloquea el cambio): ${
          err instanceof Error ? err.message : String(err)
        }`,
        'PasswordPolicyService',
      );
      return false;
    }
  }

  /** Chequeo completo (forma + brecha conocida) - usado por reset y cambio de contraseña. */
  async assertAcceptable(password: string): Promise<void> {
    this.assertValidShape(password);

    if (await this.isKnownBreached(password)) {
      throw new BadRequestException(
        'Esta contraseña apareció en una filtración de datos conocida. Elegí otra para proteger tu cuenta.',
      );
    }
  }
}
