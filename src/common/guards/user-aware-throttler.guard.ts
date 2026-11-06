import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface RequestWithUser extends Record<string, unknown> {
  user?: { id?: string };
}

/**
 * Mismo throttler de siempre, pero rastreado por usuario autenticado en vez de por IP - así el
 * límite de "modificaciones administrativas por usuario" no se comparte entre distintos admins
 * detrás de la misma IP (oficina/VPN) ni se evade con solo cambiar de IP.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: RequestWithUser): Promise<string> {
    return req.user?.id ?? (await super.getTracker(req));
  }
}
