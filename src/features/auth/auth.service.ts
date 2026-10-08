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
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { User } from './entities/user.entity';
import { toUserResponse } from './mappers/user-response.mapper';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

  async login(dto: LoginUserDto) {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email.toLowerCase().trim() },
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

    if (!user)
      throw new UnauthorizedException('Las credenciales no son válidas');

    await ComparePassword(dto.password, user.password);

    if (!user.isActive)
      throw new UnauthorizedException(
        'Tu cuenta está inactiva. Hablá con un administrador',
      );

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
