import { Role } from '../enums/system-role.enum';

export interface JwtPayload {
  id: string;
  email: string;
  role: Role;
}
