import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WithdrawalStatus } from '../enums/withdrawal-status.enum';

/**
 * Derecho de arrepentimiento (Disposición 954/2025; Código Civil y Comercial arts. 1110-1116).
 * A propósito NO referencia a `User`: el botón debe funcionar sin iniciar sesión, así que el
 * comprador se identifica con los datos que él mismo entrega acá, no con una cuenta existente.
 */
@Entity({ name: 'withdrawal_requests' })
export class WithdrawalRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  trackingCode!: string;

  @Column({ type: 'varchar' })
  buyerName!: string;

  @Column({ type: 'varchar' })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', nullable: true })
  orderReference!: string | null;

  @Column({ type: 'varchar' })
  productDescription!: string;

  @Column({ type: 'varchar', nullable: true })
  comments!: string | null;

  @Column({ type: 'varchar', default: WithdrawalStatus.RECIBIDO })
  status!: WithdrawalStatus;

  @Column({ type: 'varchar', nullable: true })
  adminNotes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: Date, nullable: true })
  resolvedAt!: Date | null;
}
