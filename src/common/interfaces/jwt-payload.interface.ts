import { Role } from '../enums/system-role.enum';

export interface JwtPayload {
  id: string;
  email: string;
  role: Role;
  /** Debe coincidir con `User.sessionVersion` - lo que permite invalidar JWTs ya emitidos
   *  (reset/cambio de contraseña) sin blacklist ni tabla de sesiones. */
  sessionVersion: number;
}
