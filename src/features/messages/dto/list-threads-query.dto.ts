import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

import { InboxAddress } from '../enums/inbox-address.enum';

const FOLDERS = ['inbox', 'archive', 'spam', 'sent', 'trash'] as const;
export type MessageFolder = (typeof FOLDERS)[number];

/** `inbox` es opcional a propósito: sin ella, el service consulta las 3 bandejas y mergea
 *  (bandeja unificada, ver sección 3 del pedido). */
export class ListThreadsQueryDto {
  @IsOptional()
  @IsEnum(InboxAddress)
  inbox?: InboxAddress;

  @IsOptional()
  @IsIn(FOLDERS)
  folder?: MessageFolder;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  labels?: string[];

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  after?: string;

  @IsOptional()
  @IsString()
  before?: string;
}
