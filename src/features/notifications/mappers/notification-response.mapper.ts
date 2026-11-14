import { AdminNotification } from '../entities/admin-notification.entity';

export interface NotificationResponse {
  readonly id: string;
  readonly type: string;
  readonly category: string;
  readonly priority: string;
  readonly title: string;
  readonly body: string;
  readonly resourceUrl: string | null;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly read: boolean;
  readonly archived: boolean;
  readonly createdAt: string;
}

/** Nunca expone `recipientId`, `dedupeKey` ni `metadata` - son detalles internos. */
export const toNotificationResponse = (notification: AdminNotification): NotificationResponse => ({
  id: notification.id,
  type: notification.type,
  category: notification.category,
  priority: notification.priority,
  title: notification.title,
  body: notification.body,
  resourceUrl: notification.resourceUrl,
  resourceType: notification.resourceType,
  resourceId: notification.resourceId,
  read: notification.readAt !== null,
  archived: notification.archivedAt !== null,
  createdAt: notification.createdAt.toISOString(),
});
