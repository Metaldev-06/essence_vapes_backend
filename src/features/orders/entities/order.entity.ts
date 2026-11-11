import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DeliveryMethod } from '../enums/delivery-method.enum';
import { LogisticsStatus } from '../enums/logistics-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { ShippingCostMode } from '../enums/shipping-cost-mode.enum';
import type { OrderPickupDetails } from '../interfaces/order-pickup-details.interface';
import type { OrderShippingAddress } from '../interfaces/order-shipping-address.interface';

/**
 * Plain join row (sin relaciones TypeORM, mismo criterio que el resto del proyecto). Siempre
 * requiere un usuario logueado - el carrito (`CartService`) ya es auth-only, así que no existe
 * un flujo de invitado que soportar acá.
 *
 * `subtotalValue` es siempre el total de líneas recalculado por el backend (nunca lo que mande
 * el frontend). `totalValue = subtotalValue + (shippingCostValue ?? 0)` - cuando el costo de
 * envío todavía no se conoce (`shippingCostValue = null`, envío "a coordinar"), `totalValue` NO
 * es el total final: la orden queda en `OrderStatus.AWAITING_SHIPPING_QUOTE`, que
 * `OrdersService.getPayableOrderOrThrow` nunca deja pagar.
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

  @Column({ type: 'varchar', default: DeliveryMethod.HOME_DELIVERY })
  deliveryMethod!: DeliveryMethod;

  // Snapshot de la dirección elegida (ver `AddressesModule`) - copiada, no referenciada, para
  // que editar/borrar la dirección original nunca altere el historial de órdenes. Solo presente
  // si `deliveryMethod === HOME_DELIVERY`.
  @Column({ type: 'simple-json', nullable: true })
  shippingAddress!: OrderShippingAddress | null;

  // Snapshot de quién retira - solo presente si `deliveryMethod === PICKUP`.
  @Column({ type: 'simple-json', nullable: true })
  pickupDetails!: OrderPickupDetails | null;

  // Estado de preparación/entrega - independiente de `status`/`paymentStatus` (ver
  // `LogisticsStatus`). Solo lo mueve un admin humano desde el panel.
  @Column({ type: 'varchar', default: LogisticsStatus.PENDING_PREPARATION })
  logisticsStatus!: LogisticsStatus;

  // Cuándo se marcó `DELIVERED`/`PICKED_UP` - "fecha de entrega o retiro" (ver tarea, punto 5).
  // Nunca un dato que tipee el admin: se deriva del momento del cambio de estado logístico
  // (`OrdersService.updateLogisticsStatus`), para no inventar una fecha aparte.
  @Column({ type: Date, nullable: true })
  logisticsCompletedAt!: Date | null;

  // `null` solo para retiros (no aplica estrategia de envío). Snapshot de la estrategia vigente
  // al momento de crear la orden - cambiar la config después nunca altera órdenes ya creadas.
  @Column({ type: 'varchar', nullable: true })
  shippingCostMode!: ShippingCostMode | null;

  // `null` = todavía no se conoce (envío "a coordinar" sin definir) - nunca se inventa un valor
  // (ver `helpers/shipping-cost.helper.ts`).
  @Column({ type: 'int', nullable: true })
  shippingCostValue!: number | null;

  // Cuándo se fijó/aceptó el costo de envío - solo relevante si la orden pasó por
  // `AWAITING_SHIPPING_QUOTE` (ver tarea, punto 3: "aceptación del comprador" antes de cobrar).
  @Column({ type: Date, nullable: true })
  shippingCostAgreedAt!: Date | null;

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
