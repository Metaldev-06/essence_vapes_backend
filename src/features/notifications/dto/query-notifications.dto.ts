import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import {
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../enums/notification.enums';

export const NOTIFICATION_STATUS_FILTERS = ['active', 'unread', 'read', 'archived'] as const;
export type NotificationStatusFilter = (typeof NOTIFICATION_STATUS_FILTERS)[number];

export class QueryNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  /** `active` (default) = todo lo no archivado; `unread`/`read` también excluyen archivadas. */
  @IsOptional()
  @IsIn(NOTIFICATION_STATUS_FILTERS)
  status?: NotificationStatusFilter = 'active';

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Resincronización tras una desconexión: solo lo creado en o después de este instante. */
  @IsOptional()
  @IsDateString()
  since?: string;
}
