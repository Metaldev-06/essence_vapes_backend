import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailModule } from '../../common/services/email/email.module';
import { PasswordPolicyModule } from '../../common/services/password-policy/password-policy.module';
import { User } from '../auth/entities/user.entity';
import { AccountSecurityController } from './account-security.controller';
import { AccountSecurityService } from './account-security.service';
import { SecurityChallenge } from './entities/security-challenge.entity';

/**
 * Global (mismo criterio que `SecurityModule`) - así `AuthService` puede inyectar
 * `AccountSecurityService` (para disparar el email de verificación al registrarse) sin que este
 * módulo tenga que importar `AuthModule`. Registra su propio `TypeOrmModule.forFeature([User])`
 * en vez de depender de `AuthModule` para el repositorio - evita la dependencia circular que
 * existiría si fuera al revés (`AuthModule` necesita este módulo, no este módulo a `AuthModule`).
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SecurityChallenge, User]),
    EmailModule,
    PasswordPolicyModule,
  ],
  controllers: [AccountSecurityController],
  providers: [AccountSecurityService],
  exports: [AccountSecurityService],
})
export class AccountSecurityModule {}
