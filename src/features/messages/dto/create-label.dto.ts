import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'El color debe tener formato hexadecimal (ej: #8b5cf6)' })
  color?: string;
}
