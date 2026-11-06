import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limitador en memoria por IP+ruta, pensado como piso mínimo para endpoints públicos sensibles
 * a abuso (arrepentimiento, login, register) sin agregar una dependencia nueva al proyecto. No
 * sobrevive un restart ni escala a más de un proceso/instancia - para producción real, usar
 * @nestjs/throttler o rate-limiting de infraestructura (ver COMPLIANCE_ARGENTINA.md).
 */
@Injectable()
export class SimpleRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ ip?: string; route?: { path?: string } }>();
    const key = `${request.route?.path ?? 'unknown'}:${request.ip ?? 'unknown'}`;
    const now = Date.now();

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (bucket.count >= options.max) {
      throw new HttpException(
        'Demasiadas solicitudes. Probá de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }
}
