import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { SecurityEventType } from '../enums/security-event-type.enum';

/**
 * Audit trail de seguridad real y consultable (sección 16 de BACKEND_SECURITY.md). Nunca
 * guarda contraseñas, tokens ni cookies - solo metadata de la request. Se purga sola (ver
 * `SecurityStateService`'s housekeeping) - no crece indefinidamente.
 */
@Entity({ name: 'security_events' })
export class SecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  type!: SecurityEventType;

  @Index()
  @Column({ type: 'varchar' })
  ip!: string;

  @Column({ type: 'varchar' })
  path!: string;

  @Column({ type: 'varchar' })
  method!: string;

  @Column({ type: 'int' })
  statusCode!: number;

  @Column({ type: 'varchar', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  requestId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
