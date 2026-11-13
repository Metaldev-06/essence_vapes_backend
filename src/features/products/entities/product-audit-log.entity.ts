import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Mismo patrón que `OrderAuditLog`/`MessageAuditLog` - quién hizo qué acción administrativa y
 *  cuándo (ver tarea, punto 5.2: "las operaciones [masivas] deben... registrar auditoría"). */
@Entity({ name: 'product_audit_logs' })
export class ProductAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  adminId!: string;

  @Column({ type: 'varchar' })
  adminEmail!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  @Column({ type: 'varchar', nullable: true })
  detail?: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
