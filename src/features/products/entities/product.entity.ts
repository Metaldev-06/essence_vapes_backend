import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { FragranceConcentration } from '../enums/fragrance-concentration.enum';
import { Gender } from '../enums/gender.enum';
import { Longevity } from '../enums/longevity.enum';
import { ProductCategory } from '../enums/product-category.enum';
import { SaleAuthorizationStatus } from '../enums/sale-authorization-status.enum';
import { Sillage } from '../enums/sillage.enum';
import type { ProductStyle } from '../constants/product-style.constants';
import type { MediaAsset } from '../interfaces/media-asset.interface';
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

  // Label for the implicit "base" variant (e.g. "5ml") - only meaningful once extra
  // ProductVariant rows exist for this product; otherwise it's just unused metadata.
  @Column({ type: 'varchar', nullable: true })
  variantLabel?: string | null;

  @Column({ type: 'simple-array', default: '' })
  notes!: string[];

  @Column({ type: 'int' })
  priceValue!: number;

  @Column({ type: 'int', nullable: true })
  oldPriceValue?: number | null;

  @Column({ type: 'varchar', nullable: true })
  badge?: string | null;

  // Color hexadecimal libre (ej: "#8b5cf6"), elegido con un color picker en el admin - no un
  // enum cerrado de opciones predefinidas.
  @Column({ type: 'varchar' })
  accent!: string;

  @Column({ type: 'varchar' })
  category!: ProductCategory;

  @Column({ type: 'simple-array', default: '' })
  styles!: ProductStyle[];

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

  @Column({ type: 'simple-json', nullable: true })
  images?: MediaAsset[] | null;

  @Column({ type: 'simple-json', nullable: true })
  videos?: MediaAsset[] | null;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // --- Transparencia de producto (sección 5/6 del cumplimiento Argentina) ---
  // Distinto de `origin` (origen/herencia de la fragancia, p. ej. "Francia") - este es el país
  // de origen a efectos de rotulado/consumidor, para no mezclar ambos conceptos.
  @Column({ type: 'varchar', nullable: true })
  countryOfOrigin?: string | null;

  @Column({ type: 'varchar', nullable: true })
  concentration?: FragranceConcentration | null;

  @Column({ type: 'float', nullable: true })
  netContentMl?: number | null;

  @Column({ type: 'varchar', nullable: true })
  manufacturerOrImporter?: string | null;

  // Texto libre: el admin lo completa si/cuando exista un registro real. Nunca se genera o
  // sugiere un número acá ni en ningún otro lugar del código.
  @Column({ type: 'varchar', nullable: true })
  sanitaryRegistrationNumber?: string | null;

  // --- Decants (sección 7) ---
  // Obligatorio mostrar en la ficha cuando category=decants: explica que es un fraccionamiento,
  // no un frasco de fábrica.
  @Column({ type: 'varchar', nullable: true })
  decantSourceDescription?: string | null;

  @Column({ type: 'float', nullable: true })
  decantVolumeMl?: number | null;

  @Column({ type: 'varchar', nullable: true })
  batchNumber?: string | null;

  // Referencia libre (mismo estilo "join plano por string" que ProductVariant.productId) al
  // perfume original del que proviene este decant. No hay descuento automático de stock desde
  // el lote de origen - ver COMPLIANCE_ARGENTINA.md para esa arquitectura futura.
  @Column({ type: 'varchar', nullable: true })
  sourceProductId?: string | null;

  // --- Vapes (sección 8) ---
  // Nunca se asigna "autorizado" por default ni automáticamente - default real es
  // "no_verificado"; solo un admin humano lo cambia con el registro en mano.
  @Column({ type: 'varchar', default: SaleAuthorizationStatus.NO_VERIFICADO })
  saleAuthorizationStatus!: SaleAuthorizationStatus;

  @Column({ type: 'varchar', nullable: true })
  saleAuthorizationCode?: string | null;

  @Column({ type: Date, nullable: true })
  saleAuthorizationValidFrom?: Date | null;

  @Column({ type: Date, nullable: true })
  saleAuthorizationValidUntil?: Date | null;

  // Derivado automáticamente a `true` cuando category=vapes (ver ProductsService) - persistido
  // como columna propia para poder filtrar/consultar sin recalcular la categoría cada vez.
  @Column({ type: 'boolean', default: false })
  requiresAgeVerification!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
