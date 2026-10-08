import { SetMetadata } from '@nestjs/common';

import { Role } from '../../../common/enums/system-role.enum';

export const META_ROLES = 'roles';

export const RoleProtected = (...roles: Role[]) =>
  SetMetadata(META_ROLES, roles);
