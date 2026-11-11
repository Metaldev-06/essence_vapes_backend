import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import type { OrderShippingAddress } from '../interfaces/order-shipping-address.interface';

/**
 * Plain join row (sin relaciones TypeORM, mismo criterio que el resto del proyecto). Siempre
 * requiere un usuario logueado - el carrito (`CartService`) ya es auth-only, así que no existe
 * un flujo de invitado que soportar acá.
 *
 * `subtotalValue`/`totalValue` son el total recalculado por el backend al momento de crear la
 * orden (nunca lo que mande el frontend). Hoy `totalValue === subtotalValue`: no existe sistema
 * de envío/costos adicionales todavía (ver checkout.md / COMPLIANCE_ARGENTINA.md) - cuando exista,
 * se suma un campo `shippingCostValue` acá en vez de inventar un monto ahora.
 */
@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar', default: OrderStatus.PENDING_PAYMENT })
  status!: OrderStatus;

  @Column({ type: 'varchar', default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Column({ type: 'int' })
  subtotalValue!: number;

  @Column({ type: 'int' })
  totalValue!: number;

  @Column({ type: 'varchar', default: 'ARS' })
  currency!: string;

  // Snapshot de datos del comprador al momento de la compra - no se re-lee de `User` después
  // (si el usuario edita su perfil luego, la orden histórica no debe cambiar).
  @Column({ type: 'varchar' })
  buyerName!: string;

  @Column({ type: 'varchar' })
  buyerEmail!: string;

  @Column({ type: 'varchar', nullable: true })
  buyerPhone?: string | null;

  // Snapshot de la dirección elegida (ver `AddressesModule`) - copiada, no referenciada, para
  // que editar/borrar la dirección original nunca altere el historial de órdenes.
  @Column({ type: 'simple-json' })
  shippingAddress!: OrderShippingAddress;

  // Obligatorio para crear la orden (checkbox de T&C) - se guarda el momento exacto, no solo un
  // booleano, como evidencia de cuándo se aceptaron los términos vigentes en ese momento.
  @Column({ type: Date })
  termsAcceptedAt!: Date;

  // Ventana de reserva de stock - ver `mercadopago.config.ts` (`orderExpirationMs`) y
  // `OrdersExpirationService`. `null` una vez que la orden sale de `pending_payment` (pagada,
  // cancelada o expirada) - ya no hay nada que vencer.
  @Column({ type: Date, nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  cancelledReason?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
