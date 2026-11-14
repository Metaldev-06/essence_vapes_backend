import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { DigestFrequency, NotificationType } from '../enums/notification.enums';

export class EventPreferenceDto {
  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  inApp!: boolean;

  @IsBoolean()
  push!: boolean;

  @IsBoolean()
  email!: boolean;
}

/** Todo opcional: el panel manda solo lo que cambió. Siempre aplica al admin autenticado - no
 *  hay ningún campo `adminId` que permita editar las preferencias de otro. */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => EventPreferenceDto)
  events?: EventPreferenceDto[];

  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietHoursStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietHoursEnd?: number;

  @IsOptional()
  @IsEnum(DigestFrequency)
  digestFrequency?: DigestFrequency;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  digestHour?: number;
}
