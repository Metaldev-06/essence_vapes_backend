import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Log de idempotencia de webhooks de Resend - clave por el `svix-id` del evento (único por
 * entrega, estable entre reintentos). Antes de procesar un webhook se chequea si ese id ya está
 * acá; si está, se responde 200 sin reprocesar (evita correos/efectos duplicados ante reintentos
 * de Resend). Nunca se guarda el payload completo acá - solo lo mínimo para deduplicar y auditar.
 */
@Entity({ name: 'message_webhook_events' })
export class WebhookEventLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  resendEventId!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @CreateDateColumn()
  processedAt!: Date;
}
