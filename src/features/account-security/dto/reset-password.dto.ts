import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  resetAuthorization!: string;

  // El largo real (8-128) lo valida `PasswordPolicyService` - este máximo es solo una cota de
  // payload (defensa en profundidad), no la política de contraseñas.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  newPassword!: string;
}
