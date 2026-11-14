import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { DigestFrequency } from '../enums/notification.enums';

/** Ajustes personales de un admin (uno por admin, `adminId` como PK) - independientes de los de
 *  cualquier otro administrador. */
@Entity({ name: 'notification_admin_settings' })
export class NotificationAdminSettings {
  @PrimaryColumn({ type: 'varchar' })
  adminId!: string;

  @Column({ type: 'boolean', default: false })
  quietHoursEnabled!: boolean;

  /** Minutos desde las 00:00, hora de Argentina (0-1439). Si `start > end` el rango cruza la
   *  medianoche (ej. 22:00 -> 08:00). */
  @Column({ type: 'int', default: 22 * 60 })
  quietHoursStart!: number;

  @Column({ type: 'int', default: 8 * 60 })
  quietHoursEnd!: number;

  @Column({ type: 'varchar', default: DigestFrequency.OFF })
  digestFrequency!: DigestFrequency;

  /** Hora local (0-23, Argentina) a la que se envía el resumen. */
  @Column({ type: 'int', default: 9 })
  digestHour!: number;

  /** Clave del último período resumido (`YYYY-MM-DD`) - evita mandar dos veces el mismo resumen
   *  aunque el job corra más de una vez dentro de la misma hora. */
  @Column({ type: 'varchar', nullable: true })
  lastDigestKey!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
