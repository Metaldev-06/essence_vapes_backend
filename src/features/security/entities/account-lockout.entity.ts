import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Estado de fuerza bruta por CUENTA (email, independiente de la IP - ver también
 * `IpBlock` para el lado IP). `tier` escala 0,1,2... y nunca decrece solo - se resetea a 0
 * recién con un login exitoso. `lockedUntil` nulo = no bloqueada en este momento.
 */
@Entity({ name: 'account_lockouts' })
export class AccountLockout {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'int', default: 0 })
  failedCount!: number;

  @Column({ type: Date })
  windowStartedAt!: Date;

  @Column({ type: Date, nullable: true })
  lockedUntil!: Date | null;

  @Column({ type: 'int', default: 0 })
  tier!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
