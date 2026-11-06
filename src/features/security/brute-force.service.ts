import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { SecurityEventType } from './enums/security-event-type.enum';
import { computeLockoutDurationMs } from './helpers/lockout-tier.helper';
import { SecurityStateService } from './security-state.service';

interface BruteForceConfig {
  maxFailedAttempts: number;
  failedWindowMs: number;
  lockoutInitialMs: number;
  lockoutMultiplier: number;
  lockoutMaxMs: number;
}

export interface LockStatus {
  locked: boolean;
  retryAfterMs?: number;
  reason?: 'account' | 'ip';
}

/**
 * Fuerza bruta de login - cuenta e IP independientes (ninguna de las dos es permanente,
 * ambas expiran solas y escalan en duración ante reincidencia). `BruteForceGuard` llama a
 * `checkLocked` antes del handler; `AuthService.login` llama a `recordFailure`/`recordSuccess`
 * alrededor de la comparación de contraseña.
 */
@Injectable()
export class BruteForceService {
  constructor(
    private readonly securityState: SecurityStateService,
    private readonly configService: ConfigService,
  ) {}

  private get config(): BruteForceConfig {
    return this.configService.get<BruteForceConfig>('security.bruteForce')!;
  }

  async checkLocked(email: string, ip: string): Promise<LockStatus> {
    const ipStatus = await this.securityState.isIpBlocked(ip);
    if (ipStatus.blocked) {
      return { locked: true, retryAfterMs: ipStatus.retryAfterMs, reason: 'ip' };
    }

    const normalizedEmail = email.toLowerCase().trim();
    const lockout = await this.securityState.getAccountLockout(normalizedEmail);
    if (lockout?.lockedUntil) {
      const retryAfterMs = lockout.lockedUntil.getTime() - Date.now();
      if (retryAfterMs > 0) return { locked: true, retryAfterMs, reason: 'account' };
    }

    return { locked: false };
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    await this.securityState.recordEvent({
      type: SecurityEventType.AUTH_FAILURE,
      ip,
      path: '/auth/login',
      method: 'POST',
      statusCode: 401,
      email: normalizedEmail,
    });

    await Promise.all([this.escalateAccountLockout(normalizedEmail), this.escalateIpLockout(ip)]);
  }

  async recordSuccess(email: string): Promise<void> {
    await this.securityState.deleteAccountLockout(email.toLowerCase().trim());
  }

  private async escalateAccountLockout(email: string): Promise<void> {
    const cfg = this.config;
    const lockout =
      (await this.securityState.getAccountLockout(email)) ??
      this.securityState.createAccountLockout(email);

    // Ya bloqueada - no re-escalar por una request que llegó justo en el borde de la carrera
    // entre el guard y acá (el guard ya debería haber rechazado esta request antes de esto).
    if (lockout.lockedUntil && lockout.lockedUntil.getTime() > Date.now()) return;

    const now = Date.now();
    if (now - lockout.windowStartedAt.getTime() > cfg.failedWindowMs) {
      lockout.windowStartedAt = new Date(now);
      lockout.failedCount = 0;
    }
    lockout.failedCount += 1;

    if (lockout.failedCount >= cfg.maxFailedAttempts) {
      const durationMs = this.tierDuration(lockout.tier, cfg);
      lockout.lockedUntil = new Date(now + durationMs);
      lockout.tier += 1;
      lockout.failedCount = 0;
      lockout.windowStartedAt = new Date(now);
      this.logIfPersistent(durationMs, cfg, `la cuenta ${email}`);
    }

    await this.securityState.saveAccountLockout(lockout);
  }

  private async escalateIpLockout(ip: string): Promise<void> {
    const alreadyBlocked = await this.securityState.isIpBlocked(ip);
    if (alreadyBlocked.blocked) return;

    const cfg = this.config;
    const recentFailures = await this.securityState.countRecentEventsByIp(
      ip,
      [SecurityEventType.AUTH_FAILURE],
      cfg.failedWindowMs,
    );
    if (recentFailures < cfg.maxFailedAttempts) return;

    const current = await this.securityState.getIpBlock(ip);
    const durationMs = this.tierDuration(current?.strikeCount ?? 0, cfg);
    await this.securityState.blockIp(ip, 'Demasiados intentos de login fallidos desde esta IP', durationMs);
    this.logIfPersistent(durationMs, cfg, `la IP ${ip}`);
  }

  private tierDuration(tier: number, cfg: BruteForceConfig): number {
    return computeLockoutDurationMs(tier, cfg.lockoutInitialMs, cfg.lockoutMultiplier, cfg.lockoutMaxMs);
  }

  private logIfPersistent(durationMs: number, cfg: BruteForceConfig, subject: string): void {
    if (durationMs >= cfg.lockoutMaxMs) {
      LoggerHelper(
        `Abuso persistente de fuerza bruta: ${subject} llegó al tope de bloqueo configurado`,
        'BruteForceService',
        true,
      );
    }
  }
}
