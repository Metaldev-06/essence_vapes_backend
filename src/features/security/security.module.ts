import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { AbuseDetectionService } from './abuse-detection.service';
import { BruteForceGuard } from './brute-force.guard';
import { BruteForceService } from './brute-force.service';
import { AccountLockout } from './entities/account-lockout.entity';
import { IpBlock } from './entities/ip-block.entity';
import { SecurityEvent } from './entities/security-event.entity';
import { IpBlockGuard } from './ip-block.guard';
import { SecurityAdminController } from './security-admin.controller';
import { SecurityStateService } from './security-state.service';

/**
 * Global (como `ConfigModule`) - así `IpBlockGuard`/`GlobalExceptionFilter`, registrados
 * app-wide en `app.module.ts`, y `AuthModule` (login) pueden inyectar estos servicios sin
 * tener que importar este módulo cada uno. Importa `AuthModule` (no al revés) para que
 * `@Auth(Role.ADMIN)` funcione en `SecurityAdminController` sin crear un ciclo.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AccountLockout, IpBlock, SecurityEvent]), AuthModule],
  controllers: [SecurityAdminController],
  providers: [
    SecurityStateService,
    BruteForceService,
    AbuseDetectionService,
    BruteForceGuard,
    IpBlockGuard,
  ],
  exports: [SecurityStateService, BruteForceService, AbuseDetectionService, BruteForceGuard, IpBlockGuard],
})
export class SecurityModule {}
