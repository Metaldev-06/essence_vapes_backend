import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const GLOBAL_SETTINGS_ID = 'global';

/** Reglas de negocio compartidas por todos los admins (fila única, id fijo `global`). */
@Entity({ name: 'notification_global_settings' })
export class NotificationGlobalSettings {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  /** Stock <= este valor (y > 0) se considera "stock bajo", salvo umbral propio del producto. */
  @Column({ type: 'int', default: 3 })
  lowStockThreshold!: number;

  /** Horas que un pedido pagado puede seguir "pendiente de preparación" antes de alertar. */
  @Column({ type: 'int', default: 24 })
  pendingPreparationHours!: number;

  /** Horas desde el pago sin que el pedido haya sido despachado / quedado listo para retiro. */
  @Column({ type: 'int', default: 72 })
  pendingDispatchHours!: number;

  /** Horas sin respuesta a un mensaje o trámite de arrepentimiento antes de alertar. */
  @Column({ type: 'int', default: 24 })
  unansweredHours!: number;

  /** Días sin stock antes de recordar que el producto requiere reposición. */
  @Column({ type: 'int', default: 7 })
  reorderReminderDays!: number;

  /** Las notificaciones más viejas que esto se eliminan solas. */
  @Column({ type: 'int', default: 90 })
  retentionDays!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
