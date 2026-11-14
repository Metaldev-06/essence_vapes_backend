import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import {
  DeliveryChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationType,
} from '../enums/notification.enums';

/**
 * Una notificación del panel para UN administrador (una fila por destinatario - así leída/
 * archivada son estados propios de cada admin). Plain row sin relaciones TypeORM, mismo criterio
 * que el resto del proyecto.
 *
 * `dedupeKey` + el índice único `(recipientId, dedupeKey)` son la garantía real de idempotencia:
 * publicar dos veces el mismo evento lógico (webhook reintentado, job que se solapa, barrido de
 * reconciliación) nunca puede dejar dos filas, sin importar la concurrencia.
 *
 * `title`/`body` nunca llevan datos privados del cliente (nombre, email, dirección, teléfono) -
 * el mismo texto se usa para Web Push, que puede mostrarse en una pantalla bloqueada.
 */
@Entity({ name: 'admin_notifications' })
@Index('idx_admin_notifications_dedupe', ['recipientId', 'dedupeKey'], { unique: true })
@Index('idx_admin_notifications_feed', ['recipientId', 'archivedAt', 'createdAt'])
@Index('idx_admin_notifications_unread', ['recipientId', 'readAt'])
export class AdminNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Id de un `User` con rol admin - plain varchar, sin FK. */
  @Column({ type: 'varchar' })
  recipientId!: string;

  @Column({ type: 'varchar' })
  type!: NotificationType;

  @Column({ type: 'varchar' })
  category!: NotificationCategory;

  @Column({ type: 'varchar' })
  priority!: NotificationPriority;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Ruta interna del panel (siempre empieza con `/admin`) - nunca una URL externa. */
  @Column({ type: 'varchar', nullable: true })
  resourceUrl!: string | null;

  @Column({ type: 'varchar', nullable: true })
  resourceType!: string | null;

  @Column({ type: 'varchar', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, string | number | boolean | null> | null;

  @Column({ type: 'varchar' })
  dedupeKey!: string;

  /** `false` = el admin apagó el canal "panel" para este evento pero dejó push o email: la fila
   *  existe igual (es el ancla de esas entregas y de la idempotencia) pero no se lista ni cuenta. */
  @Column({ type: 'boolean', default: true })
  inApp!: boolean;

  /** Canales externos (push/email) que este aviso debe entregar - la "intención" del outbox,
   *  escrita en la misma sentencia que la notificación. `null` = ninguno. Ver `insertOnce`. */
  @Column({ type: 'simple-json', nullable: true })
  deliveryChannels!: DeliveryChannel[] | null;

  @Column({ type: Date, nullable: true })
  readAt!: Date | null;

  @Column({ type: Date, nullable: true })
  archivedAt!: Date | null;

  // Se setea explícito desde JS (no `@CreateDateColumn`): SQLite guarda el default de la columna
  // con precisión de segundos, y la resincronización tras una desconexión (`?since=`) necesita
  // milisegundos reales.
  @Column({ type: Date })
  createdAt!: Date;
}
