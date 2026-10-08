import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

import { User } from '../entities/user.entity';

/** Keys of `User` that hold data, excluding its entity lifecycle hooks. */
type UserField = {
  [K in keyof User]: User[K] extends (...args: never[]) => unknown ? never : K;
}[keyof User];

export const GetUser = createParamDecorator(
  (data: UserField | undefined, context: ExecutionContext) => {
    const { user } = context.switchToHttp().getRequest<{ user?: User }>();

    if (!user)
      throw new InternalServerErrorException(
        'No se encontró el usuario en la solicitud',
      );

    return data ? user[data] : user;
  },
);
