import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** `PATCH /auth/me` - solo los campos de perfil que el brief marca como editables. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(80)
  fullName?: string;

  // Formato libre a propósito (no se fuerza un prefijo de país) - acepta "+54 9 11 1234-5678",
  // "011 1234-5678", etc. Solo valida que sean caracteres plausibles de un teléfono.
  @IsOptional()
  @IsString()
  @Matches(/^[\d\s()+-]{6,30}$/, { message: 'Ingresá un teléfono válido' })
  phone?: string | null;

  // ISO 8601 ("YYYY-MM-DD") - el rango razonable (no futura, no > 120 años) se valida en
  // `AuthService.updateProfile`, no acá (evita duplicar la fecha "hoy" en dos lugares).
  @IsOptional()
  @IsDateString()
  birthDate?: string | null;
}
