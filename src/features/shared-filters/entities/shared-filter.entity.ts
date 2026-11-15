import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Los filtros del catálogo tal como los guarda el front (`ProductsFiltersSnapshot`). */
export interface SharedFiltersPayload {
  term: string;
  category: string;
  brand: string;
  gender: string;
  sort: string;
  styles: string[];
  capacityMl: number | null;
}

/**
 * Link corto para compartir filtros del catálogo (`/productos?c=<code>`). Los mismos filtros
 * siempre dan el mismo código (`filtersHash` único), así que compartir lo mismo muchas veces no
 * acumula filas. No guarda nada de quien lo creó.
 */
@Entity({ name: 'shared_filters' })
export class SharedFilter {
  @PrimaryColumn({ type: 'varchar', length: 12 })
  code!: string;

  /** SHA-256 de los filtros normalizados: la forma de encontrar un código ya existente. */
  @Index('idx_shared_filters_hash', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  filtersHash!: string;

  @Column({ type: 'simple-json' })
  filters!: SharedFiltersPayload;

  @Column({ type: Date })
  createdAt!: Date;

  /** Última vez que alguien abrió el link: los que nadie usa en mucho tiempo se borran. */
  @Column({ type: Date, nullable: true })
  lastUsedAt!: Date | null;
}
