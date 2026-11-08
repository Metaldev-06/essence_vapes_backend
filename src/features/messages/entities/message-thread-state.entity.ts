import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { InboxAddress } from '../enums/inbox-address.enum';
import { ThreadPriority } from '../enums/thread-priority.enum';
import { ThreadStatus } from '../enums/thread-status.enum';

/**
 * Metadata de CRM para un thread de Resend Inboxes - NUNCA el contenido del correo en sí
 * (asunto, remitente, cuerpo, adjuntos siguen viviendo únicamente en Resend, fuente de verdad
 * única; esta tabla solo existe para lo que Resend genuinamente no modela: el workflow interno
 * de atención). Una fila por `resendThreadId`, creada de forma perezosa la primera vez que algo
 * la toca (un webhook o un admin abriendo la conversación) - nunca hay que "sincronizar" el
 * universo completo de threads de antemano.
 */
@Entity({ name: 'message_thread_states' })
export class MessageThreadState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  resendThreadId!: string;

  /** A qué de las 3 bandejas pertenece - evita tener que re-derivarlo pidiéndoselo a Resend. */
  @Column({ type: 'varchar' })
  inbox!: InboxAddress;

  @Column({ type: 'varchar', default: ThreadStatus.NUEVO })
  status!: ThreadStatus;

  @Column({ type: 'varchar', default: ThreadPriority.MEDIA })
  priority!: ThreadPriority;

  @Column({ type: 'boolean', default: false })
  starred!: boolean;

  /** Id de un `User` (role admin) - plain varchar, sin FK, mismo criterio que el resto del proyecto. */
  @Column({ type: 'varchar', nullable: true })
  assignedAdminId!: string | null;

  /** Momento del primer email entrante del thread - capturado una sola vez, para el cálculo real
   *  de tiempo de primera respuesta del dashboard (nunca se reescribe). */
  @Column({ type: Date, nullable: true })
  firstReceivedAt!: Date | null;

  /** Momento de la primera respuesta saliente del admin - idem, se setea una sola vez. */
  @Column({ type: Date, nullable: true })
  firstRespondedAt!: Date | null;

  /** Id del último email saliente mandado desde este thread, para poder correlacionar un futuro
   *  `email.delivered`/`email.bounced` con la conversación correcta. */
  @Column({ type: 'varchar', nullable: true })
  lastOutboundEmailId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastOutboundStatus!: 'enviado' | 'entregado' | 'rebotado' | 'retrasado' | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
