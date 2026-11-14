import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Suscripción Web Push de UN dispositivo/navegador de un admin. `endpoint` es una URL opaca del
 * servicio de push del navegador (funciona como credencial de envío hacia ese dispositivo), por
 * eso nunca se devuelve al frontend - ver `NotificationsPushService.listForAdmin`.
 */
@Entity({ name: 'push_subscriptions' })
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  adminId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 1024 })
  endpoint!: string;

  @Column({ type: 'varchar' })
  p256dh!: string;

  @Column({ type: 'varchar' })
  auth!: string;

  /** Etiqueta legible derivada del User-Agent (ej. "Chrome en Windows"). */
  @Column({ type: 'varchar' })
  deviceLabel!: string;

  @Column({ type: 'int', default: 0 })
  failureCount!: number;

  @Column({ type: Date, nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
