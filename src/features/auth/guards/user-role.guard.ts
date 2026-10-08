import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../../../common/enums/system-role.enum';
import { META_ROLES } from '../decorators/role-protected.decorator';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<Role[]>(META_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles || allowedRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: User }>();

    if (!user)
      throw new InternalServerErrorException(
        'No se encontró el usuario en la solicitud',
      );

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        `El usuario ${user.email} necesita uno de estos roles: [${allowedRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
