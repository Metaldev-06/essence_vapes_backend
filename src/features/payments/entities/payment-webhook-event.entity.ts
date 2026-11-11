import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Log de idempotencia de notificaciones de Mercado Pago - clave por el `id` propio de la
 * notificación (no el `data.id` del recurso, que se repite entre reintentos del mismo evento;
 * el `id` de la notificación es el que MP documenta para control de idempotencia). Mismo patrón
 * que `WebhookEventLog` de `features/messages`.
 */
@Entity({ name: 'payment_webhook_events' })
export class PaymentWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  notificationId!: string;

  @Column({ type: 'varchar' })
  topic!: string;

  @Column({ type: 'varchar' })
  resourceId!: string;

  @CreateDateColumn()
  processedAt!: Date;
}
