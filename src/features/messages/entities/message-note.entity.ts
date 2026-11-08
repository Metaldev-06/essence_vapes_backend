import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Nota interna sobre un thread - NUNCA se manda al cliente, no existe equivalente en Resend
 * (es puramente administrativa). Igual que `MessageThreadState`, se referencia por
 * `resendThreadId`, no por una FK a una tabla de threads local que no existe.
 */
@Entity({ name: 'message_notes' })
export class MessageNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar' })
  resendThreadId!: string;

  @Column({ type: 'varchar' })
  authorId!: string;

  @Column({ type: 'varchar' })
  authorName!: string;

  @Column({ type: 'text' })
  body!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
