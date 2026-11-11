import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { DataSource, In, Repository } from 'typeorm';

import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import { LoggerHelper } from '../../common/helpers/logger.helper';
import { EmailService } from '../../common/services/email/email.service';
import { PaginationService } from '../../common/services/pagination/pagination.service';
import { Address } from '../addresses/entities/address.entity';
import { CartService } from '../cart/cart.service';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductCategory } from '../products/enums/product-category.enum';
import { SaleAuthorizationStatus } from '../products/enums/sale-authorization-status.enum';
import { BASE_VARIANT_ID } from '../products/mappers/product-response.mapper';
import { User } from '../auth/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateLogisticsStatusDto } from './dto/update-logistics-status.dto';
import { OrderAuditLog } from './entities/order-audit-log.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { DeliveryMethod } from './enums/delivery-method.enum';
import { LogisticsStatus } from './enums/logistics-status.enum';
import { OrderStatus } from './enums/order-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { isValidLogisticsStatusForMethod } from './helpers/logistics-status.helper';
import { deriveOrderStatus } from './helpers/order-status.helper';
import { computeOrderTotals, type OrderableLine } from './helpers/order-totals.helper';
import { resolveShippingCost, type ShippingCostConfig } from './helpers/shipping-cost.helper';
import type { OrderPickupDetails } from './interfaces/order-pickup-details.interface';
import type { OrderShippingAddress } from './interfaces/order-shipping-address.interface';
import { toOrderResponse } from './mappers/order-response.mapper';
import { buildOrderCreatedEmail } from './order-emails';
import {
  buildOrderDeliveredEmail,
  buildOrderDispatchedEmail,
  buildOrderInPreparationEmail,
  buildOrderReadyForPickupEmail,
} from './order-logistics-emails';

/** Mismo shape que `AdminActor` de `features/messages` - quién hizo la acción administrativa. */
export interface AdminActor {
  readonly id: string;
  readonly email: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemsRepository: Repository<OrderItem>,
    @InjectRepository(Address) private readonly addressesRepository: Repository<Address>,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(OrderAuditLog) private readonly auditLogsRepository: Repository<OrderAuditLog>,
    private readonly cartService: CartService,
    private readonly paginationService: PaginationService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Crea una orden a partir del carrito real del usuario: revalida stock (vía
   * `CartService.validate`, que ya descarta líneas inválidas), recalcula todos los montos contra
   * precios vigentes y reserva el stock (lo decrementa ya, no al confirmar el pago) dentro de una
   * única transacción - si algo falla, nada queda a medio aplicar.
   */
  async createFromCart(userId: string, dto: CreateOrderDto) {
    const deliveryMethod = dto.deliveryMethod ?? DeliveryMethod.HOME_DELIVERY;
    const isPickup = deliveryMethod === DeliveryMethod.PICKUP;

    const [user, address, cartResult] = await Promise.all([
      this.usersRepository.findOne({ where: { id: userId } }),
      isPickup
        ? Promise.resolve(null)
        // `addressId` validado como obligatorio por `CreateOrderDto` cuando no es retiro.
        : this.addressesRepository.findOne({ where: { id: dto.addressId!, userId } }),
      this.cartService.validate(userId),
    ]);

    if (!user) throw new NotFoundException('No se encontró el usuario');
    if (!isPickup && !address) {
      throw new NotFoundException('No se encontró la dirección de envío seleccionada');
    }

    const { items, removed } = cartResult;
    if (items.length === 0) {
      throw new BadRequestException(
        'El carrito está vacío o ninguno de sus productos tiene stock disponible',
      );
    }

    // Mismo gate que ya filtra el catálogo público (`ProductsService`, flag
    // `legal.vapesSaleEnforcementEnabled`), extendido acá para que también bloquee el pago -
    // llegar con el producto ya en el carrito (link directo, carrito viejo) no debe alcanzar
    // para esquivarlo.
    if (this.configService.get<boolean>('legal.vapesSaleEnforcementEnabled')) {
      const unauthorized = items.find(
        (item) =>
          item.product!.category === ProductCategory.VAPES &&
          item.product!.saleAuthorizationStatus !== SaleAuthorizationStatus.AUTORIZADO,
      );
      if (unauthorized) {
        throw new BadRequestException(
          `"${unauthorized.product!.brand} ${unauthorized.product!.name}" todavía no tiene autorización de venta - quitalo del carrito para continuar con el resto de tu compra.`,
        );
      }
    }

    const lines: OrderableLine[] = items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      productName: `${item.product!.brand} ${item.product!.name}`,
      variantLabel: item.product!.variantLabel,
      unitPriceValue: item.product!.priceValue,
      quantity: item.quantity,
    }));
    const totals = computeOrderTotals(lines);

    const shippingAddress: OrderShippingAddress | null = isPickup
      ? null
      : {
          recipientName: address!.recipientName,
          phone: address!.phone,
          street: address!.street,
          streetNumber: address!.streetNumber,
          apartment: address!.apartment,
          city: address!.city,
          province: address!.province,
          postalCode: address!.postalCode,
          country: address!.country,
          betweenStreets: address!.betweenStreets,
          notes: address!.notes,
        };

    const pickupDetails: OrderPickupDetails | null = isPickup
      ? {
          contactName: dto.pickupContactName!.trim(),
          phone: dto.pickupPhone!.trim(),
          notes: dto.pickupNotes?.trim() || null,
        }
      : null;

    // Retiro en el local nunca tiene costo de envío - ver `resolveShippingCost`. Para envío a
    // domicilio, la estrategia vigente queda "congelada" en la orden (cambiar la config después
    // nunca altera órdenes ya creadas). `shipping.config.ts` expone el campo como `costMode` (no
    // `mode`) - se mapea acá para no acoplar el shape del `registerAs` al del helper. El envío
    // NUNCA se cobra por Mercado Pago: esta resolución es solo un dato informativo para el admin
    // (`shippingCostMode`/`shippingCostValue` en la orden) - el costo real se coordina y se cobra
    // aparte por WhatsApp después de pagar el subtotal, nunca bloquea el pago.
    const shippingSettings = this.configService.get<{
      costMode: ShippingCostConfig['mode'];
      fixedCostValue?: number;
      provinceRates: Record<string, number>;
    }>('shipping')!;
    const shippingResolution = resolveShippingCost(
      {
        mode: shippingSettings.costMode,
        fixedCostValue: shippingSettings.fixedCostValue,
        provinceRates: shippingSettings.provinceRates,
      },
      deliveryMethod,
      shippingAddress?.province,
    );

    const expirationMs = this.configService.get<number>('mercadopago.orderExpirationMs')!;
    const expiresAt = new Date(Date.now() + expirationMs);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Reserva de stock: decrementa ya (no al confirmar el pago) para que dos compradores no
      // puedan "ganar" la misma unidad mientras uno de los dos todavía está completando el pago.
      // Lectura-y-escritura dentro de la misma transacción, sin lock explícito - mismo nivel de
      // garantía que el resto de los chequeos de stock de este proyecto (`CartService.setItem`),
      // no un sistema de reservas con locks distribuidos.
      for (const line of totals.lines) {
        if (line.variantId === BASE_VARIANT_ID) {
          const product = await queryRunner.manager.findOne(Product, {
            where: { id: line.productId },
          });
          if (!product || product.stock < line.quantity) {
            throw new BadRequestException(
              `Ya no hay stock suficiente de "${line.productName}"`,
            );
          }
          await queryRunner.manager.update(Product, line.productId, {
            stock: product.stock - line.quantity,
          });
        } else {
          const variant = await queryRunner.manager.findOne(ProductVariant, {
            where: { id: line.variantId, productId: line.productId },
          });
          if (!variant || variant.stock < line.quantity) {
            throw new BadRequestException(
              `Ya no hay stock suficiente de "${line.productName}"`,
            );
          }
          await queryRunner.manager.update(ProductVariant, variant.id, {
            stock: variant.stock - line.quantity,
          });
        }
      }

      const order = queryRunner.manager.create(Order, {
        userId,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        subtotalValue: totals.subtotalValue,
        totalValue: totals.subtotalValue,
        currency: 'ARS',
        buyerName: user.fullName,
        buyerEmail: user.email,
        buyerPhone: isPickup ? pickupDetails!.phone : address!.phone,
        deliveryMethod,
        shippingAddress,
        pickupDetails,
        shippingCostMode: shippingResolution.mode,
        shippingCostValue: shippingResolution.value,
        shippingCostAgreedAt: shippingResolution.requiresQuote ? null : new Date(),
        termsAcceptedAt: new Date(),
        expiresAt,
      });
      const savedOrder = await queryRunner.manager.save(order);

      const orderItems = totals.lines.map((line) =>
        queryRunner.manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: line.productId,
          variantId: line.variantId,
          productName: line.productName,
          variantLabel: line.variantLabel,
          unitPriceValue: line.unitPriceValue,
          quantity: line.quantity,
          lineTotalValue: line.lineTotalValue,
        }),
      );
      const savedItems = await queryRunner.manager.save(OrderItem, orderItems);

      await queryRunner.manager.delete(CartItem, { userId });

      await queryRunner.commitTransaction();

      void this.notifyOrderCreated(savedOrder, savedItems);

      return { order: toOrderResponse(savedOrder, savedItems), removedFromCart: removed };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) throw error;
      HandleDBExceptions(error, 'OrdersService.createFromCart');
    } finally {
      await queryRunner.release();
    }
  }

  async findMine(userId: string, query: QueryOrdersDto) {
    const { limit = 20, offset = 0, order = 'desc', sort = 'createdAt' } = query;
    const result = await this.paginationService.paginate(this.ordersRepository, {
      limit,
      offset,
      order,
      sort: sort as keyof Order,
      where: { userId },
    });
    return { ...result, data: await this.attachItems(result.data) };
  }

  async findOneMine(userId: string, id: string) {
    const order = await this.ordersRepository.findOne({ where: { id, userId } });
    if (!order) throw new NotFoundException(`No se encontró la orden con id "${id}"`);
    const items = await this.orderItemsRepository.find({ where: { orderId: id } });
    return toOrderResponse(order, items);
  }

  /**
   * Filtros combinados (búsqueda OR por id/nombre/email + AND con estado/rango de fechas) exceden
   * lo que soporta `PaginationService.paginate` (where plano) - mismo criterio que
   * `products.service.ts` para su propio QueryBuilder. `search` nunca compara contra información
   * sensible fuera de lo que ya es visible en la propia orden.
   */
  async findAllForAdmin(query: QueryOrdersDto) {
    const {
      limit = 20,
      offset = 0,
      order = 'desc',
      sort = 'createdAt',
      status,
      paymentStatus,
      deliveryMethod,
      logisticsStatus,
      buyerEmail,
      search,
      dateFrom,
      dateTo,
    } = query;

    const qb = this.ordersRepository.createQueryBuilder('order');
    if (status) qb.andWhere('order.status = :status', { status });
    if (paymentStatus) qb.andWhere('order.paymentStatus = :paymentStatus', { paymentStatus });
    if (deliveryMethod) qb.andWhere('order.deliveryMethod = :deliveryMethod', { deliveryMethod });
    if (logisticsStatus) qb.andWhere('order.logisticsStatus = :logisticsStatus', { logisticsStatus });
    if (buyerEmail) qb.andWhere('order.buyerEmail = :buyerEmail', { buyerEmail: buyerEmail.toLowerCase().trim() });
    if (dateFrom) qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: new Date(dateFrom) });
    if (dateTo) qb.andWhere('order.createdAt <= :dateTo', { dateTo: new Date(dateTo) });
    if (search) {
      qb.andWhere(
        '(order.id LIKE :search OR LOWER(order.buyerName) LIKE :search OR LOWER(order.buyerEmail) LIKE :search)',
        { search: `%${search.toLowerCase().trim()}%` },
      );
    }

    const [data, total] = await qb
      .orderBy(`order.${sort}`, order === 'asc' ? 'ASC' : 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      data: await this.attachItems(data),
      pagination: { total, pages: Math.ceil(total / limit), current: Math.floor(offset / limit) + 1, limit, offset },
    };
  }

  async findOneForAdmin(id: string) {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`No se encontró la orden con id "${id}"`);
    const items = await this.orderItemsRepository.find({ where: { orderId: id } });
    return toOrderResponse(order, items);
  }

  /**
   * Único punto que mueve `logisticsStatus` - siempre manual, desde el panel admin (ver tarea,
   * punto 7). Nunca toca `status`/`paymentStatus`: una orden nunca se considera pagada por esto.
   * Registra quién hizo el cambio y cuándo (`OrderAuditLog`, mismo patrón que `MessageAuditLog`).
   */
  async updateLogisticsStatus(
    orderId: string,
    dto: UpdateLogisticsStatusDto,
    actor: AdminActor,
  ) {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`No se encontró la orden con id "${orderId}"`);

    if (!isValidLogisticsStatusForMethod(dto.logisticsStatus, order.deliveryMethod)) {
      throw new BadRequestException(
        `El estado "${dto.logisticsStatus}" no aplica a la modalidad "${order.deliveryMethod}"`,
      );
    }

    const previousStatus = order.logisticsStatus;
    const isTerminal =
      dto.logisticsStatus === LogisticsStatus.DELIVERED || dto.logisticsStatus === LogisticsStatus.PICKED_UP;

    order.logisticsStatus = dto.logisticsStatus;
    // "Fecha de entrega o retiro" (ver tarea, punto 5) - se deriva del momento del cambio, nunca
    // la tipea el admin. Si se corrige el estado hacia atrás, se limpia (ya no está entregado).
    order.logisticsCompletedAt = isTerminal ? order.logisticsCompletedAt ?? new Date() : null;

    const saved = await this.ordersRepository.save(order);

    await this.auditLogsRepository.save(
      this.auditLogsRepository.create({
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'update_logistics_status',
        orderId,
        detail: `${previousStatus} -> ${dto.logisticsStatus}`,
      }),
    );

    if (previousStatus !== dto.logisticsStatus) {
      void this.notifyLogisticsStatus(saved);
    }

    const items = await this.orderItemsRepository.find({ where: { orderId } });
    return toOrderResponse(saved, items);
  }

  /**
   * Solo 4 de los estados logísticos tienen un email propio (ver tarea, punto 9) - el resto
   * (`pending_preparation`, `ready_to_ship`, `in_transit`, `delivery_issue`, `picked_up`) no
   * dispara nada, para no inventar notificaciones que la tarea no pidió. Nunca se llama dos
   * veces para el mismo cambio (el único call site ya filtra `previousStatus !== nextStatus`).
   */
  private async notifyLogisticsStatus(order: Order): Promise<void> {
    const { sales } = this.emailService.addresses;
    const frontendUrl = this.configService.get<string>('accountSecurity.frontendUrl')!;

    const emailOptions = (() => {
      switch (order.logisticsStatus) {
        case LogisticsStatus.IN_PREPARATION:
          return buildOrderInPreparationEmail(sales, order, frontendUrl);
        case LogisticsStatus.READY_FOR_PICKUP:
          return buildOrderReadyForPickupEmail(sales, order, frontendUrl);
        case LogisticsStatus.DISPATCHED:
          return buildOrderDispatchedEmail(sales, order, frontendUrl);
        case LogisticsStatus.DELIVERED:
          return buildOrderDeliveredEmail(sales, order, frontendUrl);
        default:
          return null;
      }
    })();
    if (!emailOptions) return;

    const sent = await this.emailService.send(emailOptions);
    if (!sent) {
      LoggerHelper(
        `No se pudo enviar el email de estado logístico para la orden ${order.id}`,
        'OrdersService',
        true,
      );
    }
  }

  /** Historial de cambios de estado logístico de una orden - quién y cuándo (ver tarea, punto 11). */
  async getAuditLogForOrder(orderId: string): Promise<OrderAuditLog[]> {
    return this.auditLogsRepository.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Indicadores para el panel admin (ver tarea, punto 10) - deliberadamente nunca cuenta
   * `pending_payment`/`processing` como facturación confirmada, solo `paymentStatus=approved`.
   * Los indicadores logísticos (preparación/envío/retiro/entrega) también exigen pago aprobado -
   * no tiene sentido operar la logística de algo que todavía no se pagó.
   */
  async getStats() {
    const approved = { paymentStatus: PaymentStatus.APPROVED } as const;
    const [
      confirmedCount,
      confirmedRevenue,
      pendingCount,
      rejectedCount,
      totalCount,
      pendingPreparationCount,
      pendingShipmentCount,
      readyForPickupCount,
      deliveredCount,
      refundedCount,
      refundedAmount,
    ] = await Promise.all([
      this.ordersRepository.count({ where: approved }),
      this.ordersRepository
        .createQueryBuilder('order')
        .select('COALESCE(SUM(order.totalValue), 0)', 'sum')
        .where('order.paymentStatus = :status', { status: PaymentStatus.APPROVED })
        .getRawOne<{ sum: string }>(),
      this.ordersRepository.count({
        where: [{ status: OrderStatus.PENDING_PAYMENT }, { status: OrderStatus.PROCESSING }],
      }),
      this.ordersRepository.count({ where: { paymentStatus: PaymentStatus.REJECTED } }),
      this.ordersRepository.count(),
      this.ordersRepository.count({
        where: { ...approved, logisticsStatus: LogisticsStatus.PENDING_PREPARATION },
      }),
      this.ordersRepository.count({
        where: {
          ...approved,
          deliveryMethod: DeliveryMethod.HOME_DELIVERY,
          logisticsStatus: LogisticsStatus.READY_TO_SHIP,
        },
      }),
      this.ordersRepository.count({
        where: {
          ...approved,
          deliveryMethod: DeliveryMethod.PICKUP,
          logisticsStatus: LogisticsStatus.READY_FOR_PICKUP,
        },
      }),
      this.ordersRepository.count({
        where: [
          { ...approved, logisticsStatus: LogisticsStatus.DELIVERED },
          { ...approved, logisticsStatus: LogisticsStatus.PICKED_UP },
        ],
      }),
      this.ordersRepository.count({ where: { paymentStatus: PaymentStatus.REFUNDED } }),
      this.ordersRepository
        .createQueryBuilder('order')
        .select('COALESCE(SUM(order.totalValue), 0)', 'sum')
        .where('order.paymentStatus = :status', { status: PaymentStatus.REFUNDED })
        .getRawOne<{ sum: string }>(),
    ]);

    return {
      confirmedOrdersCount: confirmedCount,
      confirmedRevenueValue: Number(confirmedRevenue?.sum ?? 0),
      pendingOrdersCount: pendingCount,
      rejectedPaymentsCount: rejectedCount,
      totalOrdersCount: totalCount,
      pendingPreparationCount,
      pendingShipmentCount,
      readyForPickupCount,
      deliveredCount,
      refundedOrdersCount: refundedCount,
      refundedAmountValue: Number(refundedAmount?.sum ?? 0),
    };
  }

  /** Usado solo por `PaymentsService` - verifica dueño + que la orden todavía admita un intento. */
  async getPayableOrderOrThrow(userId: string, orderId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`No se encontró la orden con id "${orderId}"`);
    if (order.userId !== userId) {
      throw new ForbiddenException('Esta orden no pertenece a tu cuenta');
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Esta orden ya no admite un nuevo intento de pago');
    }
    if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Esta orden venció - iniciá una compra nueva');
    }
    return order;
  }

  /**
   * Único punto que mueve el `status`/`paymentStatus` reales de una orden en base a lo que
   * confirmó Mercado Pago (nunca por lo que diga el frontend) - usado por `PaymentsService`
   * tanto al procesar un pago síncrono como desde el webhook. `PAID` limpia `expiresAt` (ya no
   * hay nada que vencer); cualquier otro estado dentro de `pending_payment` lo conserva.
   */
  async applyPaymentResult(orderId: string, paymentStatus: PaymentStatus): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`No se encontró la orden con id "${orderId}"`);

    const nextStatus = deriveOrderStatus(paymentStatus, order.status);
    order.paymentStatus = paymentStatus;
    order.status = nextStatus;
    if (nextStatus !== OrderStatus.PENDING_PAYMENT) order.expiresAt = null;

    return this.ordersRepository.save(order);
  }

  async getOrderWithItems(orderId: string): Promise<{ order: Order; items: OrderItem[] }> {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`No se encontró la orden con id "${orderId}"`);
    const items = await this.orderItemsRepository.find({ where: { orderId } });
    return { order, items };
  }

  /**
   * Usado solo por `PaymentsService` para el panel admin "Transacciones" (ver tarea, punto 6) -
   * no hay relación TypeORM entre `PaymentAttempt` y `Order` (mismo criterio sin-relaciones del
   * resto del proyecto), así que ese filtro por cliente se resuelve acá y se le pasan los ids.
   */
  async findOrderIdsByBuyerText(text: string): Promise<string[]> {
    const needle = `%${text.toLowerCase().trim()}%`;
    const matches = await this.ordersRepository
      .createQueryBuilder('order')
      .select(['order.id'])
      .where('LOWER(order.buyerEmail) LIKE :needle OR LOWER(order.buyerName) LIKE :needle', { needle })
      .getMany();
    return matches.map((order) => order.id);
  }

  /** Usado solo por `PaymentsService` para enriquecer "Transacciones" con datos del comprador. */
  async getOrdersByIds(ids: string[]): Promise<Order[]> {
    if (ids.length === 0) return [];
    return this.ordersRepository.find({ where: { id: In(ids) } });
  }

  private async attachItems(orders: Order[]) {
    if (orders.length === 0) return [];
    const items = await this.orderItemsRepository.find({
      where: orders.map((order) => ({ orderId: order.id })),
    });
    const itemsByOrderId = new Map<string, OrderItem[]>();
    for (const item of items) {
      const list = itemsByOrderId.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrderId.set(item.orderId, list);
    }
    return orders.map((order) => toOrderResponse(order, itemsByOrderId.get(order.id) ?? []));
  }

  private async notifyOrderCreated(order: Order, items: OrderItem[]): Promise<void> {
    const { sales } = this.emailService.addresses;
    const sent = await this.emailService.send(buildOrderCreatedEmail(sales, order, items));
    if (!sent) {
      LoggerHelper(`No se pudo enviar el email de orden creada ${order.id}`, 'OrdersService', true);
    }
  }
}
