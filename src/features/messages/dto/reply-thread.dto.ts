import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

import { NoHeaderInjection } from '../helpers/no-header-injection.validator';

/** Llega como multipart/form-data (los adjuntos van como archivos reales, no base64 en JSON) -
 *  `cc`/`bcc` por eso son CSV, mismo criterio que `labels` en `ListThreadsQueryDto`. */
export class ReplyThreadDto {
  @ValidateIf((dto: ReplyThreadDto) => !dto.text)
  @IsString()
  html?: string;

  @ValidateIf((dto: ReplyThreadDto) => !dto.html)
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  cc?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEmail({}, { each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  bcc?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @NoHeaderInjection()
  subject?: string;

  /** Client-generated, para que un doble clic/reintento de red no mande el mismo mail 2 veces -
   *  se reenvía tal cual a Resend como `Idempotency-Key` (ver `ResendInboxAdapter.reply`). */
  @IsString()
  @MaxLength(255)
  idempotencyKey!: string;
}
