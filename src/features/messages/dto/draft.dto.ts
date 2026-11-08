import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { NoHeaderInjection } from '../helpers/no-header-injection.validator';

export class CreateDraftDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  to?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @NoHeaderInjection()
  subject?: string;

  @ValidateIf((dto: CreateDraftDto) => !dto.text)
  @IsString()
  html?: string;

  @ValidateIf((dto: CreateDraftDto) => !dto.html)
  @IsString()
  text?: string;

  /** Para crear el borrador como respuesta de un thread existente - ambos o ninguno. */
  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  replyToEmailId?: string;
}

export class UpdateDraftDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  to?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @NoHeaderInjection()
  subject?: string;

  @IsOptional()
  @IsString()
  html?: string;

  @IsOptional()
  @IsString()
  text?: string;
}
