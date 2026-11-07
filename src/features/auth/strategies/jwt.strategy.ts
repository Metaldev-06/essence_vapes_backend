import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';

import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';

import type { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { User } from '../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    configService: ConfigService,
  ) {
    super({
      secretOrKey: configService.get<string>('auth.jwtSecret') ?? '',
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Fija el algoritmo esperado en vez de dejar que lo decida el header del propio token -
      // evita ambigüedad/confusión de algoritmo (buena práctica OWASP para JWT).
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: payload.id },
    });

    if (!user) throw new UnauthorizedException('El token no es válido');
    if (!user.isActive)
      throw new UnauthorizedException(
        'Tu cuenta está inactiva. Hablá con un administrador',
      );
    // Revocación de sesiones sin tabla de sesiones: un reset/cambio de contraseña incrementa
    // `sessionVersion`, lo que invalida instantáneamente todo JWT emitido antes de ese momento.
    if (payload.sessionVersion !== user.sessionVersion)
      throw new UnauthorizedException('Tu sesión ya no es válida. Iniciá sesión de nuevo.');

    return user;
  }
}
