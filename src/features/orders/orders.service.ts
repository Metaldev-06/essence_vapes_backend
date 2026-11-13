import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { Between, DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';

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
import { bucketStart, type SalesBucketGranularity } from './helpers/sales-bucket.helper';
import { resolveShippingCost, type ShippingCostConfig } from './helpers/shipping-cost.helper';
import type { OrderPickupDetails } from './interfaces/order-pickup-details.interface';
import type { OrderShippingAddress } from './interfaces/order-shipping-address.interface';
import { toAdminOrderResponse, toOrderResponse } from './mappers/order-response.mapper';
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

/** Ver `SalesReportFiltersDto` - mismo shape, ya validado/transformado por Nest antes de llegar
 *  acá. Todos opcionales: sin ninguno, el comportamiento es el mismo que antes del reporte
 *  (usado hoy por el dashboard de la Fase 3). */
export interface SalesReportFilters {
  readonly category?: string;
  readonly brand?: string;
  readonly productId?: string;
  readonly variantId?: string;
  readonly orderStatus?: OrderStatus;
  readonly paymentStatus?: PaymentStatus;
  readonly deliveryMethod?: DeliveryMethod;
  readonly paymentMethodType?: string;
  readonly buyer?: string;
}

export interface SalesSummary {
  readonly ordersCount: number;
  readonly grossOrdersValue: number;
  readonly pendingOrdersCount: number;
  readonly cancelledOrdersCount: number;
  readonly paidOrdersCount: number;
  readonly approvedPaymentsValue: number;
  readonly averageTicketValue: number;
  readonly unitsSoldCount: number;
  readonly refundedOrdersCount: number;
  readonly refundedAmountValue: number;
}

export interface SalesTimeseriesPoint {
  readonly bucketStartUtc: string;
  readonly ordersCount: number;
  readonly grossValue: number;
  readonly approvedValue: number;
  readonly unitsSold: number;
}

export interface SalesByCategoryPoint {
  readonly category: string;
  readonly unitsSold: number;
  readonly revenueValue: number;
  readonly sharePercent: number;
}

export interface TopProductPoint {
  readonly productId: string;
  readonly variantId: string;
  readonly productName: string;
  readonly variantLabel: string | null;
  readonly category: string | null;
  readonly unitsSold: number;
  readonly revenueValue: number;
  readonly sharePercent: number;
  readonly currentStock: number | null;
  readonly imageUrl: string | null;
  readonly brand: string | null;
  // Rentabilidad (ver tarea, punto 4.3) - `null` mientras no se haya cargado `costValue` para
  // este producto/variante, nunca un cálculo inventado a partir del precio de venta. Usa el
  // costo ACTUAL (no un snapshot histórico): no existe un costo-al-momento-de-la-venta guardado,
  // así que el margen de ventas viejas se recalcula con el costo vigente hoy - limitación
  // documentada, no un dato falso.
  readonly marginValue: number | null;
  readonly marginPercent: number | null;
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
      category: item.product!.category,
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
      // UPDATE atómico condicionado por el propio WHERE (`stock >= :qty`) en vez de
      // leer-luego-escribir: la resta y el chequeo de "alcanza el stock" pasan en la MISMA
      // sentencia SQL, así que dos transacciones concurrentes sobre el mismo producto nunca
      // pueden leer el mismo stock "viejo" y pisarse entre sí (ni Postgres en producción ni
      // SQLite en desarrollo permiten que dos UPDATEs a la misma fila se intercalen a mitad de
      // camino). `affected === 0` significa que no alcanzaba el stock (o el producto no existe).
      for (const line of totals.lines) {
        if (line.variantId === BASE_VARIANT_ID) {
          const result = await queryRunner.manager
            .createQueryBuilder()
            .update(Product)
            .set({ stock: () => 'stock - :qty' })
            .where('id = :id AND stock >= :qty', { id: line.productId, qty: line.quantity })
            .execute();
          if (!result.affected) {
            throw new BadRequestException(
              `Ya no hay stock suficiente de "${line.productName}"`,
            );
          }
        } else {
          const result = await queryRunner.manager
            .createQueryBuilder()
            .update(ProductVariant)
            .set({ stock: () => 'stock - :qty' })
            .where('id = :id AND productId = :productId AND stock >= :qty', {
              id: line.variantId,
              productId: line.productId,
              qty: line.quantity,
            })
            .execute();
          if (!result.affected) {
            throw new BadRequestException(
              `Ya no hay stock suficiente de "${line.productName}"`,
            );
          }
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
          categorySnapshot: line.category ?? null,
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
      minAmount,
      maxAmount,
      paymentMethodType,
    } = query;

    const qb = this.ordersRepository.createQueryBuilder('order');
    if (status) qb.andWhere('order.status = :status', { status });
    if (paymentStatus) qb.andWhere('order.paymentStatus = :paymentStatus', { paymentStatus });
    if (deliveryMethod) qb.andWhere('order.deliveryMethod = :deliveryMethod', { deliveryMethod });
    if (logisticsStatus) qb.andWhere('order.logisticsStatus = :logisticsStatus', { logisticsStatus });
    if (buyerEmail) qb.andWhere('order.buyerEmail = :buyerEmail', { buyerEmail: buyerEmail.toLowerCase().trim() });
    if (dateFrom) qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: new Date(dateFrom) });
    if (dateTo) qb.andWhere('order.createdAt <= :dateTo', { dateTo: new Date(dateTo) });
    if (minAmount != null) qb.andWhere('order.totalValue >= :minAmount', { minAmount });
    if (maxAmount != null) qb.andWhere('order.totalValue <= :maxAmount', { maxAmount });
    if (paymentMethodType) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM "payment_attempts" "pa" WHERE "pa"."orderId" = CAST(order.id AS varchar) AND "pa"."status" = :pmtApproved AND "pa"."paymentMethodType" = :paymentMethodType)',
        { pmtApproved: PaymentStatus.APPROVED, paymentMethodType },
      );
    }
    if (search) {
      qb.andWhere(
        '(CAST(order.id AS varchar) LIKE :search OR LOWER(order.buyerName) LIKE :search OR LOWER(order.buyerEmail) LIKE :search)',
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
    return toAdminOrderResponse(order, items);
  }

  /** Notas internas del admin sobre el pedido (ver tarea, punto 7.4) - nunca visibles para el
   *  comprador. Registra el cambio en la auditoría, mismo patrón que `updateLogisticsStatus`. */
  async updateInternalNotes(orderId: string, notes: string, actor: AdminActor) {
    const order = await this.ordersRepository.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`No se encontró la orden con id "${orderId}"`);

    order.internalNotes = notes.trim() || null;
    const saved = await this.ordersRepository.save(order);

    await this.auditLogsRepository.save(
      this.auditLogsRepository.create({
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'update_internal_notes',
        orderId,
        detail: order.internalNotes ? 'Nota interna actualizada' : 'Nota interna eliminada',
      }),
    );

    const items = await this.orderItemsRepository.find({ where: { orderId } });
    return toAdminOrderResponse(saved, items);
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
    return toAdminOrderResponse(saved, items);
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

  /**
   * Condiciones opcionales de `SalesReportFiltersDto` aplicables a nivel de PEDIDO (alias
   * `order` ya agregado al query) - estado del pedido, entrega, comprador y, cuando el reporte
   * los pasa explícitamente, estado de pago y medio de pago (join contra `payment_attempts`,
   * ya que el medio de pago vive en el intento, no en la orden). Cuando el reporte filtra por
   * categoría/marca/producto/variante, restringe a pedidos que tengan AL MENOS una línea que
   * matchee (vía `EXISTS`, para no duplicar filas de pedidos con varias líneas del mismo filtro).
   */
  private applyOrderLevelFilters(qb: SelectQueryBuilder<Order>, filters: SalesReportFilters): void {
    if (filters.orderStatus) qb.andWhere('order.status = :orderStatus', { orderStatus: filters.orderStatus });
    if (filters.deliveryMethod) {
      qb.andWhere('order.deliveryMethod = :deliveryMethod', { deliveryMethod: filters.deliveryMethod });
    }
    if (filters.buyer) {
      qb.andWhere('(LOWER(order.buyerName) LIKE :buyer OR LOWER(order.buyerEmail) LIKE :buyer)', {
        buyer: `%${filters.buyer.toLowerCase()}%`,
      });
    }
    if (filters.paymentMethodType) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM "payment_attempts" "pa" WHERE "pa"."orderId" = CAST(order.id AS varchar) AND "pa"."status" = :pmtApproved AND "pa"."paymentMethodType" = :pmt)',
        { pmtApproved: PaymentStatus.APPROVED, pmt: filters.paymentMethodType },
      );
    }
    const itemConditions: string[] = [];
    const itemParams: Record<string, unknown> = {};
    if (filters.category) {
      itemConditions.push('"oi"."categorySnapshot" = :fCategory');
      itemParams['fCategory'] = filters.category;
    }
    if (filters.productId) {
      itemConditions.push('"oi"."productId" = :fProductId');
      itemParams['fProductId'] = filters.productId;
    }
    if (filters.variantId) {
      itemConditions.push('"oi"."variantId" = :fVariantId');
      itemParams['fVariantId'] = filters.variantId;
    }
    if (filters.brand) {
      itemConditions.push('"oi"."productId" IN (SELECT "id" FROM "products" WHERE LOWER("brand") = :fBrand)');
      itemParams['fBrand'] = filters.brand.toLowerCase();
    }
    if (itemConditions.length > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM "order_items" "oi" WHERE "oi"."orderId" = CAST(order.id AS varchar) AND ${itemConditions.join(' AND ')})`,
        itemParams,
      );
    }
  }

  /** Mismos filtros de categoría/marca/producto/variante que `applyOrderLevelFilters`, pero
   *  aplicados directo sobre el alias `item` (ya unido a `order`) en vez de un `EXISTS` -
   *  usado por las consultas que YA agrupan por línea (`getSalesByCategory`/`getTopProducts`). */
  private applyItemLevelFilters(qb: SelectQueryBuilder<OrderItem>, filters: SalesReportFilters): void {
    if (filters.category) qb.andWhere('item.categorySnapshot = :category', { category: filters.category });
    if (filters.productId) qb.andWhere('item.productId = :productId', { productId: filters.productId });
    if (filters.variantId) qb.andWhere('item.variantId = :variantId', { variantId: filters.variantId });
    if (filters.brand) {
      qb.andWhere('item.productId IN (SELECT "id" FROM "products" WHERE LOWER("brand") = :brand)', {
        brand: filters.brand.toLowerCase(),
      });
    }
    if (filters.orderStatus) qb.andWhere('order.status = :orderStatus', { orderStatus: filters.orderStatus });
    if (filters.deliveryMethod) {
      qb.andWhere('order.deliveryMethod = :deliveryMethod', { deliveryMethod: filters.deliveryMethod });
    }
    if (filters.buyer) {
      qb.andWhere('(LOWER(order.buyerName) LIKE :buyer OR LOWER(order.buyerEmail) LIKE :buyer)', {
        buyer: `%${filters.buyer.toLowerCase()}%`,
      });
    }
    if (filters.paymentMethodType) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM "payment_attempts" "pa" WHERE "pa"."orderId" = CAST(order.id AS varchar) AND "pa"."status" = :pmtApproved AND "pa"."paymentMethodType" = :pmt)',
        { pmtApproved: PaymentStatus.APPROVED, pmt: filters.paymentMethodType },
      );
    }
  }

  /**
   * Resumen comercial de UN período - usado por el dashboard (ver tarea, punto 3.2) y por el
   * reporte de ventas filtrable (punto 4.1), que reutiliza el mismo método en vez de duplicar la
   * agregación. Distingue a propósito tres fechas: `createdAt` (pedido recibido, haya terminado
   * pagándose o no), `paidAt` (pago efectivamente confirmado - "ventas confirmadas"/"pagos
   * aprobados") y `refundedAt` (no existe esa columna todavía, así que reembolsos se filtran por
   * `createdAt` del pedido original - limitación conocida, documentada en vez de inventar una
   * fecha). Sin filtros, el comportamiento es IDÉNTICO al de antes de agregar el reporte: las
   * métricas "confirmadas" siguen asumiendo `paymentStatus = approved` por default - un reporte
   * puede pasar `paymentStatus` explícito (ej. "rechazados") para reemplazar ese default.
   */
  private async getSalesSummary(
    from: Date,
    to: Date,
    filters: SalesReportFilters = {},
  ): Promise<SalesSummary> {
    const confirmedStatus = filters.paymentStatus ?? PaymentStatus.APPROVED;

    const createdQb = this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(order.totalValue), 0)', 'gross')
      .addSelect(
        'COALESCE(SUM(CASE WHEN order.status IN (:...pendingStatuses) THEN 1 ELSE 0 END), 0)',
        'pending',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN order.status IN (:...cancelledStatuses) THEN 1 ELSE 0 END), 0)',
        'cancelled',
      )
      .where('order.createdAt >= :from AND order.createdAt < :to', { from, to })
      .setParameters({
        pendingStatuses: [OrderStatus.PENDING_PAYMENT, OrderStatus.PROCESSING],
        cancelledStatuses: [OrderStatus.CANCELLED, OrderStatus.EXPIRED],
      });
    if (filters.paymentStatus) {
      createdQb.andWhere('order.paymentStatus = :explicitStatus', { explicitStatus: filters.paymentStatus });
    }
    this.applyOrderLevelFilters(createdQb, filters);

    const paidQb = this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(order.totalValue), 0)', 'value')
      .where('order.paymentStatus = :confirmedStatus', { confirmedStatus })
      .andWhere('order.paidAt >= :from AND order.paidAt < :to', { from, to });
    this.applyOrderLevelFilters(paidQb, filters);

    const unitsQb = this.orderItemsRepository
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'CAST(order.id AS varchar) = item.orderId')
      .select('COALESCE(SUM(item.quantity), 0)', 'units')
      .where('order.paymentStatus = :confirmedStatus', { confirmedStatus })
      .andWhere('order.paidAt >= :from AND order.paidAt < :to', { from, to });
    this.applyItemLevelFilters(unitsQb, filters);

    const refundedQb = this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(order.totalValue), 0)', 'value')
      .where('order.paymentStatus = :refunded', { refunded: PaymentStatus.REFUNDED })
      .andWhere('order.createdAt >= :from AND order.createdAt < :to', { from, to });
    this.applyOrderLevelFilters(refundedQb, filters);

    const [createdAgg, paidAgg, unitsAgg, refundedAgg] = await Promise.all([
      createdQb.getRawOne<{ count: string; gross: string; pending: string; cancelled: string }>(),
      paidQb.getRawOne<{ count: string; value: string }>(),
      unitsQb.getRawOne<{ units: string }>(),
      refundedQb.getRawOne<{ count: string; value: string }>(),
    ]);

    const paidOrdersCount = Number(paidAgg?.count ?? 0);
    const approvedPaymentsValue = Number(paidAgg?.value ?? 0);

    return {
      ordersCount: Number(createdAgg?.count ?? 0),
      grossOrdersValue: Number(createdAgg?.gross ?? 0),
      pendingOrdersCount: Number(createdAgg?.pending ?? 0),
      cancelledOrdersCount: Number(createdAgg?.cancelled ?? 0),
      paidOrdersCount,
      approvedPaymentsValue,
      averageTicketValue: paidOrdersCount > 0 ? Math.round(approvedPaymentsValue / paidOrdersCount) : 0,
      unitsSoldCount: Number(unitsAgg?.units ?? 0),
      refundedOrdersCount: Number(refundedAgg?.count ?? 0),
      refundedAmountValue: Number(refundedAgg?.value ?? 0),
    };
  }

  /** Entrega el resumen del período elegido y el del período anterior equivalente (ambos
   *  calculados por el frontend - `DateRangeSelection` - nunca inventados acá), para la
   *  comparación porcentual de cada KPI. */
  async getSalesSummaryWithComparison(
    from: Date,
    to: Date,
    previousFrom: Date,
    previousTo: Date,
    filters: SalesReportFilters = {},
  ): Promise<{ current: SalesSummary; previous: SalesSummary }> {
    const [current, previous] = await Promise.all([
      this.getSalesSummary(from, to, filters),
      this.getSalesSummary(previousFrom, previousTo, filters),
    ]);
    return { current, previous };
  }

  /**
   * Evolución de ventas para el gráfico (ver tarea, punto 3.3) - agrupa por día/semana/mes de
   * `createdAt` (cohorte por fecha de pedido): "bruto" es todo lo creado en el bucket,
   * "confirmado"/"unidades" es cuánto de ESE MISMO bucket terminó pagado, sin importar cuándo se
   * confirmó el pago. Distinto del resumen de arriba (que usa `paidAt` para las tarjetas KPI) a
   * propósito, para que un único gráfico con un solo eje temporal pueda mostrar las tres series
   * sin que la serie "aprobado" se corra a días distintos de "bruto".
   */
  async getSalesTimeseries(
    from: Date,
    to: Date,
    granularity: SalesBucketGranularity,
    filters: SalesReportFilters = {},
  ): Promise<SalesTimeseriesPoint[]> {
    const confirmedStatus = filters.paymentStatus ?? PaymentStatus.APPROVED;

    const ordersQb = this.ordersRepository
      .createQueryBuilder('order')
      .select(['order.id', 'order.totalValue', 'order.paymentStatus', 'order.createdAt'])
      .where('order.createdAt >= :from AND order.createdAt < :to', { from, to });
    this.applyOrderLevelFilters(ordersQb, filters);
    const orders = await ordersQb.getMany();

    const confirmedOrderIds = orders
      .filter((order) => order.paymentStatus === confirmedStatus)
      .map((order) => order.id);
    const items = confirmedOrderIds.length
      ? await this.orderItemsRepository.find({ where: { orderId: In(confirmedOrderIds) } })
      : [];
    const unitsByOrderId = new Map<string, number>();
    for (const item of items) {
      unitsByOrderId.set(item.orderId, (unitsByOrderId.get(item.orderId) ?? 0) + item.quantity);
    }

    interface MutableBucket {
      bucketStartUtc: string;
      ordersCount: number;
      grossValue: number;
      approvedValue: number;
      unitsSold: number;
    }

    const buckets = new Map<string, MutableBucket>();
    for (const order of orders) {
      const key = bucketStart(order.createdAt, granularity).toISOString();
      const point = buckets.get(key) ?? {
        bucketStartUtc: key,
        ordersCount: 0,
        grossValue: 0,
        approvedValue: 0,
        unitsSold: 0,
      };
      point.ordersCount += 1;
      point.grossValue += order.totalValue;
      if (order.paymentStatus === confirmedStatus) {
        point.approvedValue += order.totalValue;
        point.unitsSold += unitsByOrderId.get(order.id) ?? 0;
      }
      buckets.set(key, point);
    }

    return [...buckets.values()].sort((a, b) => a.bucketStartUtc.localeCompare(b.bucketStartUtc));
  }

  /** Distribución de ventas por categoría (ver tarea, punto 3.4) - usa `categorySnapshot` de cada
   *  línea (la categoría al momento de la venta), nunca la categoría actual del producto, que
   *  pudo cambiar después. Filtra por `paidAt` - mismo criterio que las tarjetas KPI. */
  async getSalesByCategory(
    from: Date,
    to: Date,
    filters: SalesReportFilters = {},
  ): Promise<SalesByCategoryPoint[]> {
    const confirmedStatus = filters.paymentStatus ?? PaymentStatus.APPROVED;
    const qb = this.orderItemsRepository
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'CAST(order.id AS varchar) = item.orderId')
      .select('item.categorySnapshot', 'category')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'units')
      .addSelect('COALESCE(SUM(item.lineTotalValue), 0)', 'revenue')
      .where('order.paymentStatus = :confirmedStatus', { confirmedStatus })
      .andWhere('order.paidAt >= :from AND order.paidAt < :to', { from, to })
      .groupBy('item.categorySnapshot');
    this.applyItemLevelFilters(qb, filters);
    const rows = await qb.getRawMany<{ category: string | null; units: string; revenue: string }>();

    const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue), 0);
    return rows
      .map((row) => ({
        category: row.category ?? 'sin_categoria',
        unitsSold: Number(row.units),
        revenueValue: Number(row.revenue),
        sharePercent: totalRevenue > 0 ? (Number(row.revenue) / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenueValue - a.revenueValue);
  }

  /** Productos más (o menos) vendidos (ver tarea, puntos 3.5 y 4.1) - filtra por `paidAt`, mismo
   *  criterio que el resto de las métricas de ventas confirmadas. El stock mostrado es el stock
   *  ACTUAL (no un snapshot), a propósito: es para decidir reposición, no para el historial de
   *  ventas. */
  async getTopProducts(
    from: Date,
    to: Date,
    limit: number,
    sortBy: 'revenue' | 'units',
    direction: 'top' | 'bottom' = 'top',
    filters: SalesReportFilters = {},
  ): Promise<TopProductPoint[]> {
    const confirmedStatus = filters.paymentStatus ?? PaymentStatus.APPROVED;
    const sortColumn = sortBy === 'units' ? 'units' : 'revenue';
    const sortDirection = direction === 'bottom' ? 'ASC' : 'DESC';

    const rowsQb = this.orderItemsRepository
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'CAST(order.id AS varchar) = item.orderId')
      .select('item.productId', 'productId')
      .addSelect('item.variantId', 'variantId')
      .addSelect('item.productName', 'productName')
      .addSelect('item.variantLabel', 'variantLabel')
      .addSelect('item.categorySnapshot', 'category')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'units')
      .addSelect('COALESCE(SUM(item.lineTotalValue), 0)', 'revenue')
      .where('order.paymentStatus = :confirmedStatus', { confirmedStatus })
      .andWhere('order.paidAt >= :from AND order.paidAt < :to', { from, to })
      .groupBy('item.productId')
      .addGroupBy('item.variantId')
      .addGroupBy('item.productName')
      .addGroupBy('item.variantLabel')
      .addGroupBy('item.categorySnapshot')
      .orderBy(sortColumn, sortDirection)
      .limit(limit);
    this.applyItemLevelFilters(rowsQb, filters);

    const totalQb = this.orderItemsRepository
      .createQueryBuilder('item')
      .innerJoin(Order, 'order', 'CAST(order.id AS varchar) = item.orderId')
      .select('COALESCE(SUM(item.lineTotalValue), 0)', 'revenue')
      .where('order.paymentStatus = :confirmedStatus', { confirmedStatus })
      .andWhere('order.paidAt >= :from AND order.paidAt < :to', { from, to });
    this.applyItemLevelFilters(totalQb, filters);

    const [rows, totalAgg] = await Promise.all([
      rowsQb.getRawMany<{
        productId: string;
        variantId: string;
        productName: string;
        variantLabel: string | null;
        category: string | null;
        units: string;
        revenue: string;
      }>(),
      totalQb.getRawOne<{ revenue: string }>(),
    ]);

    const totalRevenue = Number(totalAgg?.revenue ?? 0);
    const productIds = [...new Set(rows.map((row) => row.productId))];
    const variantIds = rows
      .map((row) => row.variantId)
      .filter((id) => id !== BASE_VARIANT_ID);

    const [products, variants] = await Promise.all([
      productIds.length
        ? this.dataSource.getRepository(Product).find({ where: { id: In(productIds) } })
        : Promise.resolve([]),
      variantIds.length
        ? this.dataSource.getRepository(ProductVariant).find({ where: { id: In(variantIds) } })
        : Promise.resolve([]),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    return rows.map((row) => {
      const product = productById.get(row.productId);
      const variant = row.variantId !== BASE_VARIANT_ID ? variantById.get(row.variantId) : undefined;
      const revenueValue = Number(row.revenue);
      const unitsSold = Number(row.units);
      const unitCost = variant ? variant.costValue : product?.costValue;
      const marginValue = unitCost != null ? revenueValue - unitCost * unitsSold : null;
      return {
        productId: row.productId,
        variantId: row.variantId,
        productName: row.productName,
        variantLabel: row.variantLabel,
        category: row.category,
        unitsSold,
        revenueValue,
        sharePercent: totalRevenue > 0 ? (revenueValue / totalRevenue) * 100 : 0,
        currentStock: variant ? variant.stock : (product?.stock ?? null),
        imageUrl: variant?.images?.[0]?.url ?? product?.images?.[0]?.url ?? null,
        brand: product?.brand ?? null,
        marginValue,
        marginPercent: marginValue != null && revenueValue > 0 ? (marginValue / revenueValue) * 100 : null,
      };
    });
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
    if (nextStatus === OrderStatus.PAID && !order.paidAt) order.paidAt = new Date();

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
