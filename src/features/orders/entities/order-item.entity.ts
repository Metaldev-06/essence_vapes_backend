import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Línea de una orden - snapshot histórico (nombre/precio/variante) independiente del estado
 * actual del `Product`/`ProductVariant` referenciado (que puede cambiar de precio o borrarse
 * después). Mismo patrón variant-aware que `CartItem`/`Favorite` (`variantId` default 'base').
 */
@Entity({ name: 'order_items' })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  orderId!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  @Column({ type: 'varchar', default: 'base' })
  variantId!: string;

  @Column({ type: 'varchar' })
  productName!: string;

  // Snapshot de `Product.category` al momento de la venta - un reporte de ventas por categoría
  // agrupado por la categoría ACTUAL del producto daría cifras incorrectas si el producto cambió
  // de categoría después de vendido. `null` solo en líneas creadas antes de este campo.
  @Column({ type: 'varchar', nullable: true })
  categorySnapshot?: string | null;

  @Column({ type: 'varchar', nullable: true })
  variantLabel?: string | null;

  @Column({ type: 'int' })
  unitPriceValue!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'int' })
  lineTotalValue!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
