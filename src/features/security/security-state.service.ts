import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { In, LessThan, MoreThan, Repository } from 'typeorm';

import { AccountLockout } from './entities/account-lockout.entity';
import { IpBlock } from './entities/ip-block.entity';
import { SecurityEvent } from './entities/security-event.entity';
import { SecurityEventType } from './enums/security-event-type.enum';

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;
const EVENT_RETENTION_MS = 24 * 60 * 60 * 1000;
const STALE_STATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface BlockStatus {
  blocked: boolean;
  retryAfterMs?: number;
}

/**
 * Primitivas de datos compartidas por `BruteForceService` y `AbuseDetectionService` - ninguna
 * de las dos reimplementa su propio almacenamiento. Todo persiste en la misma base SQLite del
 * proyecto (sobrevive un restart, sin agregar Redis - ver BACKEND_SECURITY.md).
 */
@Injectable()
export class SecurityStateService implements OnModuleInit, OnModuleDestroy {
  private housekeepingTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(AccountLockout)
    private readonly lockoutRepository: Repository<AccountLockout>,
    @InjectRepository(IpBlock)
    private readonly ipBlockRepository: Repository<IpBlock>,
    @InjectRepository(SecurityEvent)
    private readonly eventRepository: Repository<SecurityEvent>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    // No usa @nestjs/schedule a propósito (una dependencia más para una sola tarea) - un
    // setInterval nativo alcanza para podar filas viejas una vez por hora.
    this.housekeepingTimer = setInterval(() => void this.runHousekeeping(), HOUSEKEEPING_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.housekeepingTimer) clearInterval(this.housekeepingTimer);
  }

  async isIpBlocked(ip: string): Promise<BlockStatus> {
    const block = await this.ipBlockRepository.findOne({ where: { ip } });
    if (!block?.blockedUntil) return { blocked: false };

    const retryAfterMs = block.blockedUntil.getTime() - Date.now();
    if (retryAfterMs <= 0) return { blocked: false };
    return { blocked: true, retryAfterMs };
  }

  async blockIp(ip: string, reason: string, durationMs: number): Promise<void> {
    const existing = await this.ipBlockRepository.findOne({ where: { ip } });
    const blockedUntil = new Date(Date.now() + durationMs);

    if (existing) {
      existing.reason = reason;
      existing.strikeCount += 1;
      existing.blockedUntil = blockedUntil;
      await this.ipBlockRepository.save(existing);
      return;
    }

    await this.ipBlockRepository.save(
      this.ipBlockRepository.create({ ip, reason, strikeCount: 1, blockedUntil }),
    );
  }

  async unblockIp(ip: string): Promise<void> {
    await this.ipBlockRepository.delete({ ip });
  }

  getIpBlock(ip: string): Promise<IpBlock | null> {
    return this.ipBlockRepository.findOne({ where: { ip } });
  }

  listIpBlocks(): Promise<IpBlock[]> {
    return this.ipBlockRepository.find({ order: { updatedAt: 'DESC' } });
  }

  getAccountLockout(email: string): Promise<AccountLockout | null> {
    return this.lockoutRepository.findOne({ where: { email } });
  }

  createAccountLockout(email: string): AccountLockout {
    return this.lockoutRepository.create({
      email,
      failedCount: 0,
      windowStartedAt: new Date(),
      lockedUntil: null,
      tier: 0,
    });
  }

  saveAccountLockout(lockout: AccountLockout): Promise<AccountLockout> {
    return this.lockoutRepository.save(lockout);
  }

  async deleteAccountLockout(email: string): Promise<void> {
    await this.lockoutRepository.delete({ email });
  }

  listAccountLockouts(): Promise<AccountLockout[]> {
    return this.lockoutRepository.find({ order: { updatedAt: 'DESC' } });
  }

  async recordEvent(event: {
    type: SecurityEventType;
    ip: string;
    path: string;
    method: string;
    statusCode: number;
    userId?: string | null;
    email?: string | null;
    requestId?: string | null;
  }): Promise<void> {
    if (!this.configService.get<boolean>('security.loggingEnabled')) return;

    await this.eventRepository.save(
      this.eventRepository.create({
        userId: null,
        email: null,
        requestId: null,
        ...event,
      }),
    );
  }

  /** Cuántos eventos de estos tipos tuvo esta IP en la ventana - base de la detección de abuso. */
  countRecentEventsByIp(ip: string, types: SecurityEventType[], windowMs: number): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    return this.eventRepository.count({
      where: { ip, type: In(types), createdAt: MoreThan(since) },
    });
  }

  private async runHousekeeping(): Promise<void> {
    const eventCutoff = new Date(Date.now() - EVENT_RETENTION_MS);
    await this.eventRepository.delete({ createdAt: LessThan(eventCutoff) });

    const staleCutoff = new Date(Date.now() - STALE_STATE_RETENTION_MS);
    await this.ipBlockRepository.delete({ updatedAt: LessThan(staleCutoff) });
    await this.lockoutRepository.delete({ updatedAt: LessThan(staleCutoff) });
  }
}
