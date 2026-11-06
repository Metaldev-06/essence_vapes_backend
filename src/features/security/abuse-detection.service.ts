import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SecurityEventType } from './enums/security-event-type.enum';
import { computeLockoutDurationMs } from './helpers/lockout-tier.helper';
import { SecurityStateService } from './security-state.service';

interface AbuseConfig {
  suspiciousMax: number;
  suspiciousWindowMs: number;
  blockInitialMs: number;
  blockMultiplier: number;
  blockMaxMs: number;
}

export interface SuspiciousRequest {
  type: SecurityEventType;
  ip: string;
  path: string;
  method: string;
  statusCode: number;
  userId?: string | null;
  requestId?: string | null;
}

/**
 * Patrones de abuso por IP (401/403/404 reiterados, scraping de rutas admin) - a propósito
 * nunca bloquea por un solo evento (sección 3 del pedido): solo escala cuando se supera un
 * umbral de eventos en una ventana, con duración creciente ante reincidencia y expiración
 * automática, igual que `BruteForceService`.
 */
@Injectable()
export class AbuseDetectionService {
  constructor(
    private readonly securityState: SecurityStateService,
    private readonly configService: ConfigService,
  ) {}

  private get config(): AbuseConfig {
    return this.configService.get<AbuseConfig>('security.abuse')!;
  }

  async record(event: SuspiciousRequest): Promise<void> {
    await this.securityState.recordEvent(event);

    const alreadyBlocked = await this.securityState.isIpBlocked(event.ip);
    if (alreadyBlocked.blocked) return;

    const cfg = this.config;
    const recentCount = await this.securityState.countRecentEventsByIp(
      event.ip,
      [
        SecurityEventType.FORBIDDEN,
        SecurityEventType.NOT_FOUND_SENSITIVE,
        SecurityEventType.ADMIN_ACCESS_DENIED,
      ],
      cfg.suspiciousWindowMs,
    );
    if (recentCount < cfg.suspiciousMax) return;

    const current = await this.securityState.getIpBlock(event.ip);
    const durationMs = computeLockoutDurationMs(
      current?.strikeCount ?? 0,
      cfg.blockInitialMs,
      cfg.blockMultiplier,
      cfg.blockMaxMs,
    );
    await this.securityState.blockIp(
      event.ip,
      'Patrón de abuso detectado (401/403/404 reiterados o scraping)',
      durationMs,
    );
  }
}
