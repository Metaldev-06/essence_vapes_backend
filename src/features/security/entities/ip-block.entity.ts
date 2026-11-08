import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Bloqueo temporal por IP - alimentado tanto por `BruteForceService` (demasiados fallos de
 * login desde la misma IP) como por `AbuseDetectionService` (401/403/404 repetidos,
 * scraping, acceso a rutas admin sin autorización). Siempre expira solo por `blockedUntil` -
 * nunca es permanente.
 */
@Entity({ name: 'ip_blocks' })
export class IpBlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  ip!: string;

  @Column({ type: 'varchar' })
  reason!: string;

  @Column({ type: 'int', default: 0 })
  strikeCount!: number;

  @Column({ type: Date, nullable: true })
  blockedUntil!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
