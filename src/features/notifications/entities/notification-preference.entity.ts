import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { NotificationType } from '../enums/notification.enums';

/**
 * Preferencia de UN admin para UN tipo de evento. Solo existe la fila si el admin cambió algo:
 * sin fila rigen los defaults de `notification-catalog.ts`, así un tipo de evento nuevo funciona
 * para todos sin backfill.
 */
@Entity({ name: 'notification_preferences' })
@Index('idx_notification_preferences_unique', ['adminId', 'type'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  adminId!: string;

  @Column({ type: 'varchar' })
  type!: NotificationType;

  /** `false` = este evento no genera ninguna alerta para este admin (salvo los críticos, que
   *  siempre quedan en el panel - ver `resolveChannels`). */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'boolean', default: true })
  inApp!: boolean;

  @Column({ type: 'boolean', default: false })
  push!: boolean;

  @Column({ type: 'boolean', default: false })
  email!: boolean;

  @UpdateDateColumn()
  updatedAt!: Date;
}
