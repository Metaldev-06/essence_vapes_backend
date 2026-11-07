import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import { LessThan, Repository } from 'typeorm';

import { Role } from '../../common/enums/system-role.enum';
import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import {
  ComparePassword,
  HashPassword,
} from '../../common/helpers/hashPassword.helper';
import { LoggerHelper } from '../../common/helpers/logger.helper';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { EmailService } from '../../common/services/email/email.service';
import {
  buildEmailVerificationEmail,
} from '../account-security/account-security-emails';
import { AccountSecurityService } from '../account-security/account-security.service';
import { BruteForceService } from '../security/brute-force.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { toUserResponse } from './mappers/user-response.mapper';

const INVALID_CREDENTIALS_MESSAGE = 'Las credenciales no son válidas';

/**
 * Corte fijo (no `new Date()`) para el backfill de `emailVerified` en `onModuleInit` - ver
 * ACCOUNT_SECURITY.md. Cuentas creadas ANTES de este momento se "perdonan" (se tratan como
 * verificadas, ya que demostraron históricamente el acceso a su email/contraseña antes de que
 * existiera este requisito); cuentas creadas en o después de este instante nunca se tocan acá,
 * siempre deben verificar de verdad. Mover esta fecha hacia adelante en el tiempo NO vuelve a
 * perdonar retroactivamente a nadie creado después del primer deploy de esta constante.
 */
const EMAIL_VERIFICATION_GRANDFATHER_CUTOFF = new Date('2026-11-07T00:00:00.000Z');

// Hash bcrypt válido (costo 10) de una contraseña que no es la de ningún usuario real - se
// compara contra esto cuando el email no existe, solo para que bcrypt haga el mismo trabajo
// (mismo tiempo de respuesta) que si el usuario existiera. Nunca es ella misma un secreto real.
const DUMMY_PASSWORD_HASH = '$2b$10$UnMOTY4FAhutbds35q7IXOZin1aau5Bpbdw0r.HGar1HkENyLUtN6';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly bruteForceService: BruteForceService,
    private readonly accountSecurityService: AccountSecurityService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.grandfatherExistingAccountsEmailVerification();

    const email = this.configService.get<string>('auth.adminEmail');
    const password = this.configService.get<string>('auth.adminPassword');

    if (!email || !password) {
      LoggerHelper(
        'ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin seed',
        'AuthService',
      );
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const exists = await this.usersRepository.exists({
      where: { email: normalizedEmail },
    });
    if (exists) return;

    await this.usersRepository.save(
      this.usersRepository.create({
        email: normalizedEmail,
        password: await HashPassword(password),
        fullName: 'Administrador',
        role: Role.ADMIN,
      }),
    );

    LoggerHelper(`Admin user seeded: ${normalizedEmail}`, 'AuthService');
  }

  async register(dto: RegisterUserDto) {
    try {
      const user = this.usersRepository.create({
        ...dto,
        password: await HashPassword(dto.password),
        role: Role.REGULAR,
      });
      const saved = await this.usersRepository.save(user);
      await this.sendEmailVerification(saved);
      return this.buildSession(saved);
    } catch (error) {
      HandleDBExceptions(error, 'AuthService.register');
    }
  }

  /**
   * Nunca lanza - un email que no sale (o incluso un fallo inesperado emitiendo el token) no
   * debe impedir que el registro se complete. El usuario siempre puede reenviarlo después
   * desde Configuración de cuenta (`POST /auth/email-verification/resend`).
   */
  private async sendEmailVerification(user: User): Promise<void> {
    try {
      const ttlMs = this.configService.get<number>('accountSecurity.emailVerification.tokenTtlMs')!;
      const frontendUrl = this.configService.get<string>('accountSecurity.frontendUrl')!;
      const token = await this.accountSecurityService.issueEmailVerificationToken(user.id, ttlMs);
      await this.emailService.send(
        buildEmailVerificationEmail(this.emailService.addresses.noReply, user, token, frontendUrl),
      );
    } catch (error) {
      LoggerHelper(
        `No se pudo emitir/enviar la verificación de email para ${user.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'AuthService',
        true,
      );
    }
  }

  /**
   * Backfill de una sola vez (idempotente - solo toca filas que todavía están en `false`): las
   * cuentas que ya existían al momento de agregar `emailVerified` no se bloquean masivamente.
   * Ver ACCOUNT_SECURITY.md y el comentario de `EMAIL_VERIFICATION_GRANDFATHER_CUTOFF`.
   */
  private async grandfatherExistingAccountsEmailVerification(): Promise<void> {
    const result = await this.usersRepository.update(
      { emailVerified: false, createdAt: LessThan(EMAIL_VERIFICATION_GRANDFATHER_CUTOFF) },
      { emailVerified: true },
    );

    if ((result.affected ?? 0) > 0) {
      LoggerHelper(
        `Se perdonaron ${result.affected} cuenta(s) existente(s) sin emailVerified (anteriores a ${EMAIL_VERIFICATION_GRANDFATHER_CUTOFF.toISOString()})`,
        'AuthService',
      );
    }
  }

  async updateProfile(user: User, dto: UpdateProfileDto) {
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.birthDate !== undefined) {
      if (dto.birthDate !== null) this.assertPlausibleBirthDate(dto.birthDate);
      user.birthDate = dto.birthDate;
    }

    const saved = await this.usersRepository.save(user);
    return toUserResponse(saved);
  }

  /** El formato ISO ya lo valida el DTO (`@IsDateString`) - esto solo descarta fechas
   *  imposibles (futuras, o de más de 120 años), no exige una edad mínima real. */
  private assertPlausibleBirthDate(birthDate: string): void {
    const date = new Date(birthDate);
    const now = new Date();
    const minDate = new Date(now.getFullYear() - 120, now.getMonth(), now.getDate());

    if (date.getTime() > now.getTime()) {
      throw new BadRequestException('La fecha de nacimiento no puede ser futura');
    }
    if (date.getTime() < minDate.getTime()) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }
  }

  getSecurityStatus(user: User) {
    return {
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
    };
  }

  /**
   * "Cerrar sesión en todos los dispositivos" (sección Sesiones de Configuración de cuenta) -
   * sin tabla de sesiones no se puede listar/cerrar dispositivos individuales, pero esto sí
   * invalida de verdad todo JWT ya emitido (incluido el de la pestaña actual, que el frontend
   * debe tratar como cerrado inmediatamente después de llamar a esto).
   */
  async revokeAllSessions(user: User): Promise<void> {
    user.sessionVersion += 1;
    await this.usersRepository.save(user);
  }

  /**
   * `ip` viene del controller (ver `@Ip()`) para que `BruteForceService` pueda contar fallos
   * tanto por cuenta como por IP. El mensaje de error es SIEMPRE el mismo genérico - ni
   * "no existe esa cuenta" ni "está inactiva" se distinguen del simple error de contraseña
   * (no revelar si una cuenta existe, OWASP A07).
   */
  async login(dto: LoginUserDto, ip: string) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersRepository.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        fullName: true,
        phone: true,
        birthDate: true,
        role: true,
        isActive: true,
        emailVerified: true,
        emailVerifiedAt: true,
        passwordChangedAt: true,
        sessionVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Compara SIEMPRE contra un hash real (el del usuario, o uno dummy si no existe) para que
    // bcrypt haga el mismo trabajo en ambos casos - evita que el tiempo de respuesta delate si
    // el email está registrado.
    const passwordMatches = await ComparePassword(dto.password, user?.password ?? DUMMY_PASSWORD_HASH);

    if (!user || !passwordMatches || !user.isActive) {
      await this.bruteForceService.recordFailure(email, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.bruteForceService.recordSuccess(email);
    return this.buildSession(user);
  }

  checkStatus(user: User) {
    return this.buildSession(user);
  }

  private buildSession(user: User) {
    const payload: JwtPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    };

    return {
      user: toUserResponse(user),
      token: this.jwtService.sign(payload),
    };
  }
}
