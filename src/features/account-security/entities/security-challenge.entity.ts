import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { SecurityChallengePurpose } from '../enums/security-challenge-purpose.enum';
import { SecurityChallengeStatus } from '../enums/security-challenge-status.enum';

/**
 * Una sola entidad para los 3 propósitos (verificación de email, recuperación de contraseña,
 * cambio de contraseña autenticado) en vez de 3 tablas casi idénticas - ver ACCOUNT_SECURITY.md.
 * Plain columns, sin `@ManyToOne` (mismo criterio que `Favorite`/`CartItem` - ningún otro
 * feature de este proyecto usa relaciones TypeORM).
 *
 * Para los flujos de 2 pasos (reset/change), `secretHash` representa el código de 6 dígitos
 * mientras `status=pending`, y se REEMPLAZA por el hash de una autorización opaca de un solo
 * uso en el momento en que el código se valida correctamente (ver `AccountSecurityService`) -
 * así el código de baja entropía nunca sigue siendo válido una vez usado para autorizar el paso
 * final, y la autorización final nunca es ella misma un código adivinable.
 */
@Entity({ name: 'security_challenges' })
@Index(['userId', 'purpose', 'status'])
export class SecurityChallenge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  purpose!: SecurityChallengePurpose;

  /** HMAC-SHA256(secreto, SECURITY_CHALLENGE_SECRET) - nunca el valor en texto plano. */
  @Column({ type: 'varchar' })
  secretHash!: string;

  @Column({ type: 'varchar', default: SecurityChallengeStatus.PENDING })
  status!: SecurityChallengeStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: Date })
  expiresAt!: Date;

  @Column({ type: Date, nullable: true })
  consumedAt!: Date | null;
}
