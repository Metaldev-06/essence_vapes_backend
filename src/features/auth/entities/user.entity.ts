import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Role } from '../../../common/enums/system-role.enum';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar', select: false })
  password!: string;

  @Column({ type: 'varchar' })
  fullName!: string;

  @Column({ type: 'varchar', nullable: true })
  phone!: string | null;

  @Column({ type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ type: 'varchar', default: Role.REGULAR })
  role!: Role;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // Default `false` a nivel de columna (semánticamente correcto - no asumir que nadie verificó
  // nada). Las cuentas que ya existían al momento de agregar esta columna se "perdonan" una sola
  // vez en `AuthService.onModuleInit` (ver ACCOUNT_SECURITY.md) - esto NO vuelve a correr para
  // cuentas creadas después de ese momento.
  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ type: Date, nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: Date, nullable: true })
  passwordChangedAt!: Date | null;

  // Incrementar esto invalida instantáneamente todo JWT ya emitido (ver JwtStrategy.validate) -
  // el mecanismo de revocación de sesiones de este proyecto, que no tiene tabla de sesiones.
  @Column({ type: 'int', default: 1 })
  sessionVersion!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  normalizeEmail(): void {
    if (this.email) this.email = this.email.toLowerCase().trim();
  }
}
