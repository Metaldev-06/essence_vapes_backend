import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Auditoría de acciones administrativas sobre el centro de mensajes (responder, cambiar estado,
 * archivar, etc.) - nunca guarda el cuerpo del mensaje ni datos sensibles, solo la acción y
 * metadata mínima para trazabilidad (ver BACKEND_SECURITY.md §16 de este módulo, EMAIL_CRM.md).
 */
@Entity({ name: 'message_audit_logs' })
export class MessageAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  adminId!: string;

  @Column({ type: 'varchar' })
  adminEmail!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  resendThreadId!: string | null;

  /** Detalle corto y no sensible (ej. "status: nuevo -> resuelto") - nunca un cuerpo de email. */
  @Column({ type: 'varchar', nullable: true })
  detail!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
