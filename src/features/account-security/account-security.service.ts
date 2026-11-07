import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { DataSource, MoreThan, Repository } from 'typeorm';

import { ComparePassword } from '../../common/helpers/hashPassword.helper';
import { User } from '../auth/entities/user.entity';
import { SecurityChallenge } from './entities/security-challenge.entity';
import { SecurityChallengePurpose } from './enums/security-challenge-purpose.enum';
import { SecurityChallengeStatus } from './enums/security-challenge-status.enum';
import {
  generateNumericCode,
  generateOpaqueToken,
  hashSecret,
  secretMatches,
} from './helpers/challenge-secret.helper';

export type EmailConfirmOutcome = 'ok' | 'already_verified' | 'expired' | 'invalid';
export type CodeVerifyOutcome = 'invalid' | 'expired' | 'too_many_attempts';

export interface IssueLimits {
  cooldownMs: number;
  hourlyMax: number;
}

export interface IssueResult {
  allowed: boolean;
  retryAfterMs?: number;
}

/** Separador seguro: no aparece ni en un UUID ni en base64url. */
const AUTHORIZATION_SEPARATOR = '.';

/**
 * Dueño único del ciclo de vida de `SecurityChallenge` para los 3 propósitos, y de las
 * mutaciones de `User` que esos propósitos finalmente producen (marcar verificado, cambiar el
 * hash de contraseña, bump de `sessionVersion`) - ver ACCOUNT_SECURITY.md para el diseño
 * completo. Tiene su propio `TypeOrmModule.forFeature([User])` (ver `account-security.module.ts`)
 * en vez de depender de `AuthModule`, igual criterio que `features/security` no depende de
 * `AuthModule` para sus propias tablas - evita una dependencia circular con `AuthService`, que
 * sí necesita llamar a este servicio (para disparar la verificación al registrarse).
 */
@Injectable()
export class AccountSecurityService {
  constructor(
    @InjectRepository(SecurityChallenge)
    private readonly challengeRepository: Repository<SecurityChallenge>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  private get serverSecret(): string {
    return this.configService.get<string>('accountSecurity.challengeSecret')!;
  }

  private get maxAttempts(): number {
    return this.configService.get<number>('accountSecurity.maxAttemptsPerChallenge')!;
  }

  private get authorizationTtlMs(): number {
    return this.configService.get<number>('accountSecurity.authorizationTtlMs')!;
  }

  // ---------------------------------------------------------------------------------------
  // Lookup sin filtrar existencia de cuenta - el caller (controller) decide el mensaje genérico.
  // ---------------------------------------------------------------------------------------

  findUserByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.toLowerCase().trim() } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /** Factor adicional para "cambiar contraseña" (Fase 4.2) - nunca confiar solo en la sesión. */
  async verifyCurrentPassword(userId: string, currentPassword: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) return false;
    return ComparePassword(currentPassword, user.password);
  }

  // ---------------------------------------------------------------------------------------
  // Rate limiting de emisión (cooldown + tope horario) - independiente del rate limiting por
  // IP que ya cubre `@Throttle` en el controller.
  // ---------------------------------------------------------------------------------------

  async canIssue(
    userId: string,
    purpose: SecurityChallengePurpose,
    limits: IssueLimits,
  ): Promise<IssueResult> {
    const latest = await this.challengeRepository.findOne({
      where: { userId, purpose },
      order: { createdAt: 'DESC' },
    });

    if (latest) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < limits.cooldownMs) {
        return { allowed: false, retryAfterMs: limits.cooldownMs - elapsed };
      }
    }

    const since = new Date(Date.now() - 3_600_000);
    const countLastHour = await this.challengeRepository.count({
      where: { userId, purpose, createdAt: MoreThan(since) },
    });
    if (countLastHour >= limits.hourlyMax) {
      return { allowed: false, retryAfterMs: 3_600_000 };
    }

    return { allowed: true };
  }

  // ---------------------------------------------------------------------------------------
  // Emisión - invalida cualquier challenge PENDING anterior del mismo (usuario, propósito)
  // antes de crear el nuevo, así nunca hay dos códigos/tokens válidos en simultáneo.
  // ---------------------------------------------------------------------------------------

  async issueEmailVerificationToken(userId: string, ttlMs: number): Promise<string> {
    const token = generateOpaqueToken();
    await this.issue(userId, SecurityChallengePurpose.EMAIL_VERIFICATION, token, ttlMs);
    return token;
  }

  async issuePasswordResetCode(userId: string, ttlMs: number): Promise<string> {
    const code = generateNumericCode();
    await this.issue(userId, SecurityChallengePurpose.PASSWORD_RESET, code, ttlMs);
    return code;
  }

  async issuePasswordChangeCode(userId: string, ttlMs: number): Promise<string> {
    const code = generateNumericCode();
    await this.issue(userId, SecurityChallengePurpose.PASSWORD_CHANGE, code, ttlMs);
    return code;
  }

  private async issue(
    userId: string,
    purpose: SecurityChallengePurpose,
    plainSecret: string,
    ttlMs: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SecurityChallenge);
      await repo.update(
        { userId, purpose, status: SecurityChallengeStatus.PENDING },
        { status: SecurityChallengeStatus.INVALIDATED },
      );
      await repo.save(
        repo.create({
          userId,
          purpose,
          secretHash: hashSecret(plainSecret, this.serverSecret),
          status: SecurityChallengeStatus.PENDING,
          attempts: 0,
          expiresAt: new Date(Date.now() + ttlMs),
          consumedAt: null,
        }),
      );
    });
  }

  // ---------------------------------------------------------------------------------------
  // Verificación de email - token único, 1 paso. Idempotente: un token ya consumido devuelve
  // "already_verified" (no "invalid") si se reintenta con el mismo valor exacto.
  // ---------------------------------------------------------------------------------------

  async confirmEmailVerification(
    token: string,
  ): Promise<{ outcome: EmailConfirmOutcome; userId?: string }> {
    const hash = hashSecret(token, this.serverSecret);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SecurityChallenge);
      const pending = await repo.findOne({
        where: {
          secretHash: hash,
          purpose: SecurityChallengePurpose.EMAIL_VERIFICATION,
          status: SecurityChallengeStatus.PENDING,
        },
      });

      if (pending) {
        if (pending.expiresAt.getTime() <= Date.now()) {
          pending.status = SecurityChallengeStatus.INVALIDATED;
          await repo.save(pending);
          return { outcome: 'expired' as const };
        }

        pending.status = SecurityChallengeStatus.CONSUMED;
        pending.consumedAt = new Date();
        await repo.save(pending);

        const userRepo = manager.getRepository(User);
        await userRepo.update(pending.userId, {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        });

        return { outcome: 'ok' as const, userId: pending.userId };
      }

      const already = await repo.findOne({
        where: {
          secretHash: hash,
          purpose: SecurityChallengePurpose.EMAIL_VERIFICATION,
          status: SecurityChallengeStatus.CONSUMED,
        },
      });
      if (already) return { outcome: 'already_verified' as const, userId: already.userId };

      return { outcome: 'invalid' as const };
    });
  }

  // ---------------------------------------------------------------------------------------
  // Flujo de 2 pasos (reset / change): código de 6 dígitos -> autorización opaca de un solo
  // uso. El código deja de ser válido apenas se usa (su hash se reemplaza), así que nunca
  // puede reutilizarse para autorizar un segundo cambio.
  // ---------------------------------------------------------------------------------------

  async verifyCode(
    userId: string,
    purpose: SecurityChallengePurpose.PASSWORD_RESET | SecurityChallengePurpose.PASSWORD_CHANGE,
    code: string,
  ): Promise<{ outcome: 'ok'; authorization: string } | { outcome: CodeVerifyOutcome }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SecurityChallenge);
      const challenge = await repo.findOne({
        where: { userId, purpose, status: SecurityChallengeStatus.PENDING },
        order: { createdAt: 'DESC' },
      });
      if (!challenge) return { outcome: 'invalid' as const };

      if (challenge.expiresAt.getTime() <= Date.now()) {
        challenge.status = SecurityChallengeStatus.INVALIDATED;
        await repo.save(challenge);
        return { outcome: 'expired' as const };
      }

      if (challenge.attempts >= this.maxAttempts) {
        challenge.status = SecurityChallengeStatus.INVALIDATED;
        await repo.save(challenge);
        return { outcome: 'too_many_attempts' as const };
      }

      if (!secretMatches(code, this.serverSecret, challenge.secretHash)) {
        challenge.attempts += 1;
        const exhausted = challenge.attempts >= this.maxAttempts;
        if (exhausted) challenge.status = SecurityChallengeStatus.INVALIDATED;
        await repo.save(challenge);
        return { outcome: exhausted ? ('too_many_attempts' as const) : ('invalid' as const) };
      }

      const authorizationSecret = generateOpaqueToken();
      challenge.secretHash = hashSecret(authorizationSecret, this.serverSecret);
      challenge.attempts = 0;
      challenge.expiresAt = new Date(Date.now() + this.authorizationTtlMs);
      await repo.save(challenge);

      return {
        outcome: 'ok' as const,
        authorization: `${challenge.id}${AUTHORIZATION_SEPARATOR}${authorizationSecret}`,
      };
    });
  }

  // ---------------------------------------------------------------------------------------
  // Efectos finales sobre `User` - consumir la autorización y aplicar la contraseña nueva
  // pasa en la MISMA transacción, para que ambos sean atómicos (nunca queda una autorización
  // consumida sin que la contraseña haya cambiado, ni viceversa).
  // ---------------------------------------------------------------------------------------

  /**
   * Variante SIN `userId` para "olvidé mi contraseña" (flujo no autenticado, Fase 2): la
   * identidad del usuario no la tiene el caller en ningún momento - la autorización opaca
   * (challengeId + secreto de alta entropía) ES la prueba de identidad. Devuelve `null` si no
   * es válida (no se tocó nada).
   */
  async applyNewPasswordByAuthorization(
    authorization: string,
    newPasswordHash: string,
  ): Promise<User | null> {
    const parsed = this.parseAuthorization(authorization);
    if (!parsed) return null;

    return this.dataSource.transaction(async (manager) => {
      const challenge = await this.consumeChallengeSecret(
        manager.getRepository(SecurityChallenge),
        { id: parsed.challengeId, purpose: SecurityChallengePurpose.PASSWORD_RESET },
        parsed.secret,
      );
      if (!challenge) return null;

      return this.setNewPassword(manager.getRepository(User), challenge.userId, newPasswordHash);
    });
  }

  /**
   * Variante CON `userId` para "cambiar contraseña" (flujo autenticado, Fase 4): además de la
   * autorización en sí, se exige que pertenezca al usuario de la sesión actual - defensa en
   * profundidad aunque la autorización ya sea criptográficamente suficiente por sí sola.
   */
  async applyNewPasswordForUser(
    userId: string,
    authorization: string,
    newPasswordHash: string,
  ): Promise<User | null> {
    const parsed = this.parseAuthorization(authorization);
    if (!parsed) return null;

    return this.dataSource.transaction(async (manager) => {
      const challenge = await this.consumeChallengeSecret(
        manager.getRepository(SecurityChallenge),
        { id: parsed.challengeId, userId, purpose: SecurityChallengePurpose.PASSWORD_CHANGE },
        parsed.secret,
      );
      if (!challenge) return null;

      return this.setNewPassword(manager.getRepository(User), userId, newPasswordHash);
    });
  }

  private parseAuthorization(authorization: string): { challengeId: string; secret: string } | null {
    const separatorIndex = authorization.indexOf(AUTHORIZATION_SEPARATOR);
    if (separatorIndex <= 0) return null;
    const secret = authorization.slice(separatorIndex + 1);
    if (!secret) return null;
    return { challengeId: authorization.slice(0, separatorIndex), secret };
  }

  /** Debe correr dentro de una transacción abierta por el caller. */
  private async consumeChallengeSecret(
    repo: Repository<SecurityChallenge>,
    where: Partial<Pick<SecurityChallenge, 'id' | 'userId' | 'purpose'>>,
    secret: string,
  ): Promise<SecurityChallenge | null> {
    const challenge = await repo.findOne({
      where: { ...where, status: SecurityChallengeStatus.PENDING },
    });
    if (!challenge) return null;

    if (challenge.expiresAt.getTime() <= Date.now()) {
      challenge.status = SecurityChallengeStatus.INVALIDATED;
      await repo.save(challenge);
      return null;
    }
    if (!secretMatches(secret, this.serverSecret, challenge.secretHash)) return null;

    challenge.status = SecurityChallengeStatus.CONSUMED;
    challenge.consumedAt = new Date();
    await repo.save(challenge);
    return challenge;
  }

  private setNewPassword(
    userRepo: Repository<User>,
    userId: string,
    newPasswordHash: string,
  ): Promise<User | null> {
    return userRepo.findOne({ where: { id: userId } }).then((user) => {
      if (!user) return null;
      user.password = newPasswordHash;
      user.passwordChangedAt = new Date();
      user.sessionVersion += 1;
      return userRepo.save(user);
    });
  }
}
