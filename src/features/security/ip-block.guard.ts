import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { SecurityStateService } from './security-state.service';

interface RequestLike {
  ip?: string;
  path?: string;
}

interface ResponseLike {
  setHeader: (name: string, value: string) => void;
}

/**
 * Global (`APP_GUARD`, registrado primero) - corta cualquier request de una IP bloqueada
 * antes de que llegue al throttler o a la lógica de negocio. `/health/*` queda exceptuado
 * (un chequeo de salud nunca debe quedar bloqueado por esto).
 */
@Injectable()
export class IpBlockGuard implements CanActivate {
  constructor(private readonly securityState: SecurityStateService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    if (request.path?.includes('/health')) return true;

    const ip = request.ip ?? 'unknown';
    const status = await this.securityState.isIpBlocked(ip);
    if (!status.blocked) return true;

    const response = context.switchToHttp().getResponse<ResponseLike>();
    response.setHeader('Retry-After', String(Math.ceil((status.retryAfterMs ?? 0) / 1000)));
    throw new HttpException(
      'Acceso temporalmente restringido por actividad sospechosa.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
