import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { InboxAddress } from '../enums/inbox-address.enum';

/**
 * Firma editable por bandeja - una fila por `InboxAddress`, creada perezosamente con un default
 * razonable (ver `messages.service.ts#getSignature`) la primera vez que se pide. Nunca se
 * inventan datos de contacto que el titular no dio (sin teléfono/dirección física).
 */
@Entity({ name: 'inbox_signatures' })
export class InboxSignature {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  inbox!: InboxAddress;

  @Column({ type: 'text' })
  body!: string;

  @UpdateDateColumn()
  updatedAt!: Date;
}
