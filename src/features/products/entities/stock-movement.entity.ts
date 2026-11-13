import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Historial de ajustes manuales de stock (ver tarea, punto 5.3) - a propósito solo cubre
 * ajustes hechos a mano desde el panel (`ProductsService.adjustStock`), no cada movimiento
 * automático del checkout (reserva al crear una orden, restitución al vencer) - instrumentar
 * esos puntos también queda fuera de esta pasada para no tocar de nuevo el flujo de pago en
 * producción el mismo día que ya se corrigió la condición de carrera del stock.
 */
@Entity({ name: 'stock_movements' })
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  @Column({ type: 'varchar', default: 'base' })
  variantId!: string;

  // Positivo = suma stock, negativo = resta - nunca el stock resultante en sí (ver `stockAfter`).
  @Column({ type: 'int' })
  quantityChange!: number;

  @Column({ type: 'int' })
  stockAfter!: number;

  @Column({ type: 'varchar' })
  reason!: string;

  @Column({ type: 'varchar' })
  adminId!: string;

  @Column({ type: 'varchar' })
  adminEmail!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
