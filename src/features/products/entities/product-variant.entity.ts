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

  @Column({ type: 'int', default: 0 })
  stock!: number;

  // `null` means "inherit the parent product's images" - only set when this variant has its own.
  @Column({ type: 'simple-json', nullable: true })
  images?: MediaAsset[] | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
