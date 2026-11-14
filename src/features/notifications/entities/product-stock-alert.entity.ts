import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { StockAlertState } from '../enums/notification.enums';

/**
 * Estado de alerta de stock por producto+variante (`variantId = 'base'` para el producto sin
 * variantes - mismo patrón variant-aware que carrito/favoritos). Vive en su propia tabla a
 * propósito: no agrega columnas a `products`/`product_variants`.
 *
 * `lastState` es lo que evita alertas repetidas: solo se notifica cuando el estado calculado
 * difiere del guardado (una transición real), nunca mientras el producto sigue igual.
 */
@Entity({ name: 'product_stock_alerts' })
@Index('idx_product_stock_alerts_unique', ['productId', 'variantId'], { unique: true })
export class ProductStockAlert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  @Column({ type: 'varchar', default: 'base' })
  variantId!: string;

  /** Umbral propio de este producto/variante - `null` = usa el umbral global. */
  @Column({ type: 'int', nullable: true })
  threshold!: number | null;

  @Column({ type: 'varchar', default: StockAlertState.OK })
  lastState!: StockAlertState;

  /** Cuenta las transiciones - forma parte del `dedupeKey` para que cada episodio (el producto
   *  vuelve a quedarse sin stock un mes después) genere su propia notificación. */
  @Column({ type: 'int', default: 0 })
  episode!: number;

  @Column({ type: Date, nullable: true })
  stateChangedAt!: Date | null;

  @Column({ type: Date, nullable: true })
  reorderNotifiedAt!: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
