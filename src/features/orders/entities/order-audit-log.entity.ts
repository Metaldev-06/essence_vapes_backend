import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Auditoría de acciones administrativas sobre una orden (hoy: cambios de estado logístico) -
 * mismo patrón que `MessageAuditLog` (ver `features/messages`). Nunca guarda datos sensibles del
 * pago/tarjeta, solo la acción y un detalle corto no sensible.
 */
@Entity({ name: 'order_audit_logs' })
export class OrderAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  adminId!: string;

  @Column({ type: 'varchar' })
  adminEmail!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Index()
  @Column({ type: 'varchar' })
  orderId!: string;

  /** Detalle corto ("pending_preparation -> in_preparation") - nunca un dato sensible. */
  @Column({ type: 'varchar', nullable: true })
  detail!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
