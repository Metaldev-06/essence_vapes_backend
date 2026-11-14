import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DeliveryChannel, DeliveryStatus } from '../enums/notification.enums';

/**
 * Outbox de entregas por canales externos (push / email). Se encola junto con su
 * `AdminNotification` (ver `NotificationsService.insertOnce` para cómo se garantiza que no se
 * pierda) y `NotificationDeliveryWorker` lo procesa después con reintentos -
 * un fallo de Resend o del servicio de push nunca afecta al flujo que originó el evento (un
 * pago, un ajuste de stock). El índice único `(notificationId, channel)` impide dos envíos del
 * mismo aviso por el mismo canal.
 */
@Entity({ name: 'notification_deliveries' })
@Index('idx_notification_deliveries_unique', ['notificationId', 'channel'], { unique: true })
@Index('idx_notification_deliveries_queue', ['status', 'nextAttemptAt'])
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  notificationId!: string;

  @Column({ type: 'varchar' })
  recipientId!: string;

  @Column({ type: 'varchar' })
  channel!: DeliveryChannel;

  @Column({ type: 'varchar', default: DeliveryStatus.PENDING })
  status!: DeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: Date, nullable: true })
  nextAttemptAt!: Date | null;

  /** Mensaje saneado y truncado - nunca un token, una clave ni el payload completo. */
  @Column({ type: 'varchar', nullable: true })
  lastError!: string | null;

  @Column({ type: Date, nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
