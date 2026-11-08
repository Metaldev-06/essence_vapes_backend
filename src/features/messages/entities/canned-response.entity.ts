import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { InboxAddress } from '../enums/inbox-address.enum';

/**
 * Respuesta rápida/plantilla - concepto puramente administrativo, Resend no tiene equivalente.
 * `body` puede incluir variables `{{nombre_cliente}}`/`{{producto}}`/`{{comercio}}`, reemplazadas
 * en el momento de insertar la plantilla en el editor (ver `messages.service.ts`) - nunca se
 * envían automáticamente, siempre quedan en el borrador para que el admin las revise antes.
 */
@Entity({ name: 'canned_responses' })
export class CannedResponse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  /** `null` = disponible en cualquier bandeja. */
  @Column({ type: 'varchar', nullable: true })
  inbox!: InboxAddress | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
