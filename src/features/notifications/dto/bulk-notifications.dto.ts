import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator';

export const BULK_NOTIFICATION_ACTIONS = ['read', 'unread', 'archive', 'unarchive', 'delete'] as const;
export type BulkNotificationAction = (typeof BULK_NOTIFICATION_ACTIONS)[number];

export class BulkNotificationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsIn(BULK_NOTIFICATION_ACTIONS)
  action!: BulkNotificationAction;
}
