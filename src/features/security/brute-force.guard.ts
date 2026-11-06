import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { BruteForceService } from './brute-force.service';

interface LoginRequest {
  body?: { email?: unknown };
  ip?: string;
}

interface ResponseLike {
  setHeader: (name: string, value: string) => void;
}

/**
 * Corre ANTES del `ValidationPipe` (los guards van antes que los pipes en Nest), así que lee
 * `body.email` crudo, sin validar todavía - si falta o no es string, deja pasar: el DTO lo va
 * a rechazar después igual, no es trabajo de este guard.
 */
@Injectable()
export class BruteForceGuard implements CanActivate {
  constructor(private readonly bruteForceService: BruteForceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LoginRequest>();
    const email = typeof request.body?.email === 'string' ? request.body.email : '';
    const ip = request.ip ?? 'unknown';

    if (!email) return true;

    const status = await this.bruteForceService.checkLocked(email, ip);
    if (!status.locked) return true;

    const response = context.switchToHttp().getResponse<ResponseLike>();
    response.setHeader('Retry-After', String(Math.ceil((status.retryAfterMs ?? 0) / 1000)));
    throw new HttpException(
      'Demasiados intentos fallidos. Probá de nuevo más tarde.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
