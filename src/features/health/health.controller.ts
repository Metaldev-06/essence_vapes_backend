import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SkipThrottle } from '@nestjs/throttler';

import { DataSource } from 'typeorm';

/**
 * Públicos a propósito (orquestadores/Traefik los pegan sin credenciales) pero sin info
 * sensible de infraestructura - solo "arriba"/"abajo". Exceptuados del throttling global y
 * de `IpBlockGuard` (ver ese guard) para que nunca un chequeo de salud quede bloqueado.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Liveness: el proceso responde. No toca nada más. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: además, la base de datos responde. */
  @Get('ready')
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      throw new HttpException(
        { status: 'error', database: 'down' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
