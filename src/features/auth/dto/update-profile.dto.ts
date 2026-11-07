import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** `PATCH /auth/me` - solo los campos de perfil que el brief marca como editables. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(80)
  fullName?: string;
}
