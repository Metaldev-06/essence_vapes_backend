import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AccentKey } from '../enums/accent-key.enum';
import { Gender } from '../enums/gender.enum';
import { Longevity } from '../enums/longevity.enum';
import { ProductCategory } from '../enums/product-category.enum';
import { ScentStyle } from '../enums/scent-style.enum';
import { Sillage } from '../enums/sillage.enum';
import type {
  DayUsage,
  FragranceNotes,
  OccasionRatings,
  SeasonUsage,
} from '../interfaces/product-attributes.interface';

@Entity({ name: 'products' })
export class Product {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  brand!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar' })
  subtitle!: string;

  @Column({ type: 'simple-array', default: '' })
  notes!: string[];

  @Column({ type: 'int' })
  priceValue!: number;

  @Column({ type: 'int', nullable: true })
  oldPriceValue?: number | null;

  @Column({ type: 'varchar', nullable: true })
  badge?: string | null;

  @Column({ type: 'varchar' })
  accent!: AccentKey;

  @Column({ type: 'varchar' })
  category!: ProductCategory;

  @Column({ type: 'simple-array', default: '' })
  styles!: ScentStyle[];

  @Column({ type: 'boolean', default: false })
  featured!: boolean;

  @Column({ type: 'int', nullable: true })
  year?: number | null;

  @Column({ type: 'varchar', nullable: true })
  origin?: string | null;

  @Column({ type: 'varchar', nullable: true })
  gender?: Gender | null;

  @Column({ type: 'float', nullable: true })
  rating?: number | null;

  @Column({ type: 'int', nullable: true })
  ratingCount?: number | null;

  @Column({ type: 'simple-array', nullable: true })
  accords?: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  fragranceNotes?: FragranceNotes | null;

  @Column({ type: 'simple-array', nullable: true })
  mood?: string[] | null;

  @Column({ type: 'simple-json', nullable: true })
  seasonUsage?: SeasonUsage | null;

  @Column({ type: 'simple-json', nullable: true })
  dayUsage?: DayUsage | null;

  @Column({ type: 'simple-json', nullable: true })
  occasions?: OccasionRatings | null;

  @Column({ type: 'varchar', nullable: true })
  sillage?: Sillage | null;

  @Column({ type: 'varchar', nullable: true })
  longevity?: Longevity | null;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
