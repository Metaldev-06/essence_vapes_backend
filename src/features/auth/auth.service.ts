import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Role } from '../../common/enums/system-role.enum';
import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import {
  ComparePassword,
  HashPassword,
} from '../../common/helpers/hashPassword.helper';
import { LoggerHelper } from '../../common/helpers/logger.helper';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { BruteForceService } from '../security/brute-force.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { User } from './entities/user.entity';
import { toUserResponse } from './mappers/user-response.mapper';

const INVALID_CREDENTIALS_MESSAGE = 'Las credenciales no son válidas';

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
  ) {}

  async onModuleInit(): Promise<void> {
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
      return this.buildSession(saved);
    } catch (error) {
      HandleDBExceptions(error, 'AuthService.register');
    }
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
        role: true,
        isActive: true,
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
    };

    return {
      user: toUserResponse(user),
      token: this.jwtService.sign(payload),
    };
  }
}
