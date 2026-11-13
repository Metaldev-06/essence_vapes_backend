import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { MediaAsset } from '../interfaces/media-asset.interface';

/** Plain join row (no ORM relations, matching Product/CartItem in this codebase). */
@Entity({ name: 'product_variants' })
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  @Column({ type: 'varchar' })
  label!: string;

  @Column({ type: 'int' })
  priceValue!: number;

  // Costo de adquisición/fabricación de ESTA variante - `null` hasta que el admin lo carga (ver
  // tarea, punto 4.3). No hereda el costo del producto base: cada variante puede tener un costo
  // distinto (ej. 2ml vs 10ml de un mismo decant).
  @Column({ type: 'int', nullable: true })
  costValue?: number | null;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  // `null` means "inherit the parent product's images" - only set when this variant has its own.
  @Column({ type: 'simple-json', nullable: true })
  images?: MediaAsset[] | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  // Independent from the parent Product's `featured` - marking the product doesn't cascade to
  // its variants anymore (a 2ml and a 5ml of the same perfume can be featured independently).
  @Column({ type: 'boolean', default: false })
  featured!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
