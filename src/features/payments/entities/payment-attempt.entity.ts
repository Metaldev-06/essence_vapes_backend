import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PaymentStatus } from '../../orders/enums/payment-status.enum';

/**
 * Un intento de pago contra la Orders API de Mercado Pago para una `Order` interna. Una orden
 * puede tener varios intentos (reintento tras un rechazo) - por eso NO se guarda `mpOrderId` en
 * `Order` directamente: el webhook llega con el id de la *order de Mercado Pago* de un intento
 * puntual, y hay que resolverlo contra el intento correcto, no asumir que es siempre el último.
 */
@Entity({ name: 'payment_attempts' })
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  orderId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  idempotencyKey!: string;

  // Null solo si la llamada a MP falló antes de recibir un id (ver `failureReason`).
  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  mpOrderId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  mpPaymentId?: string | null;

  @Column({ type: 'varchar', default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  statusDetail?: string | null;

  // Mensaje saneado (nunca el token de tarjeta, nunca el access token) para diagnóstico.
  @Column({ type: 'varchar', nullable: true })
  failureReason?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
