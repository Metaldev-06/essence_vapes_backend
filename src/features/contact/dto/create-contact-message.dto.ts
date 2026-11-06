import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Mismos 4 motivos que ofrece el formulario de contacto del frontend (`contact-form.ts`). */
export const CONTACT_REASONS = [
  'consulta-general',
  'estado-pedido',
  'cambios-devoluciones',
  'trabaja-con-nosotros',
] as const;

export type ContactReason = (typeof CONTACT_REASONS)[number];

export class CreateContactMessageDto {
  @IsString()
  @MinLength(2, { message: 'Contanos tu nombre' })
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Dejanos un email de contacto válido' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsIn(CONTACT_REASONS)
  reason!: ContactReason;

  @IsString()
  @MinLength(10, { message: 'Contanos un poco más (mínimo 10 caracteres)' })
  @MaxLength(2000)
  message!: string;
}
