import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmPasswordChangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  changeAuthorization!: string;

  // Factor adicional explícito (Fase 4.2 del brief) - nunca confiar solo en la sesión + código
  // por email para una operación de alto riesgo. Toda cuenta de este proyecto tiene contraseña
  // local (no existe login federado todavía), así que siempre se exige.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  currentPassword!: string;

  // El largo real (8-128) lo valida `PasswordPolicyService` - este máximo es solo una cota de
  // payload (defensa en profundidad), no la política de contraseñas.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  newPassword!: string;
}
