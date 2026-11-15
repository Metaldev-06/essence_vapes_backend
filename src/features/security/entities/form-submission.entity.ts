import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Formularios públicos con tope diario por visitante. */
export enum LimitedForm {
  CONTACT = 'contact',
  WITHDRAWAL = 'withdrawal',
}

/**
 * Un envío aceptado de un formulario público, para contar cuántos hizo cada visitante en las
 * últimas 24 horas (ver `FormSubmissionLimitService`). No guarda NADA del contenido del
 * formulario, y la IP se guarda como hash (no se puede volver a la IP original). Se purga sola:
 * las filas de más de 48 horas se borran en cada envío nuevo.
 */
@Entity({ name: 'form_submissions' })
@Index('idx_form_submissions_lookup', ['form', 'ipHash', 'createdAt'])
export class FormSubmission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  form!: LimitedForm;

  /** HMAC-SHA256 de la IP con un secreto del servidor. */
  @Column({ type: 'varchar', length: 64 })
  ipHash!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
