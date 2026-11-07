import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Dirección de envío de un usuario - plain columns, sin `@ManyToOne` (mismo criterio que
 * `Favorite`/`CartItem`, ningún feature de este proyecto usa relaciones TypeORM). Campos
 * pensados para domicilios argentinos (provincia/CP en vez de state/zip).
 */
@Entity({ name: 'addresses' })
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  /** Nombre amigable para identificarla ("Casa", "Trabajo"), no para el envío en sí. */
  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'varchar' })
  recipientName!: string;

  @Column({ type: 'varchar' })
  phone!: string;

  @Column({ type: 'varchar' })
  street!: string;

  @Column({ type: 'varchar' })
  streetNumber!: string;

  /** Piso/depto - opcional, no todos los domicilios lo tienen. */
  @Column({ type: 'varchar', nullable: true })
  apartment!: string | null;

  @Column({ type: 'varchar' })
  city!: string;

  @Column({ type: 'varchar' })
  province!: string;

  @Column({ type: 'varchar' })
  postalCode!: string;

  @Column({ type: 'varchar', default: 'Argentina' })
  country!: string;

  /** Referencias de entrega ("entre calles", "timbre 3B", etc.) - opcional. */
  @Column({ type: 'varchar', nullable: true })
  notes!: string | null;

  /** Una sola dirección por usuario puede tener esto en `true` - lo garantiza
   *  `AddressesService`, no una constraint de DB (SQLite no tiene unique parcial simple acá). */
  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
