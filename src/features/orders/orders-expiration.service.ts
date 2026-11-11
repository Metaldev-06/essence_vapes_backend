import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, LessThan } from 'typeorm';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { BASE_VARIANT_ID } from '../products/mappers/product-response.mapper';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { PaymentStatus } from './enums/payment-status.enum';

/**
 * Libera el stock reservado por órdenes `pending_payment` que vencieron sin confirmarse -
 * contraparte de la reserva hecha en `OrdersService.createFromCart`. Corre cada minuto; cada
 * orden se procesa en su propia transacción, así una falla en una no bloquea al resto.
 */
@Injectable()
export class OrdersExpirationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Interval(60_000)
  async releaseExpiredOrders(): Promise<void> {
    const expired = await this.dataSource.getRepository(Order).find({
      where: { status: OrderStatus.PENDING_PAYMENT, expiresAt: LessThan(new Date()) },
    });

    for (const order of expired) {
      try {
        await this.releaseOne(order);
      } catch (error) {
        LoggerHelper(
          `No se pudo liberar la orden vencida ${order.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'OrdersExpirationService',
          true,
        );
      }
    }
  }

  private async releaseOne(order: Order): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Re-chequea dentro de la transacción: si el pago se confirmó justo entre el `find` de
      // arriba y este punto, no tocar nada (evita liberar stock de una orden que en realidad sí
      // se pagó).
      const fresh = await queryRunner.manager.findOne(Order, { where: { id: order.id } });
      if (!fresh || fresh.status !== OrderStatus.PENDING_PAYMENT) {
        await queryRunner.rollbackTransaction();
        return;
      }

      const items = await queryRunner.manager.find(OrderItem, { where: { orderId: order.id } });
      for (const item of items) {
        if (item.variantId === BASE_VARIANT_ID) {
          await queryRunner.manager.increment(
            Product,
            { id: item.productId },
            'stock',
            item.quantity,
          );
        } else {
          await queryRunner.manager.increment(
            ProductVariant,
            { id: item.variantId },
            'stock',
            item.quantity,
          );
        }
      }

      await queryRunner.manager.update(Order, order.id, {
        status: OrderStatus.EXPIRED,
        paymentStatus:
          fresh.paymentStatus === PaymentStatus.PENDING ? PaymentStatus.CANCELLED : fresh.paymentStatus,
        expiresAt: null,
        cancelledReason: 'expired',
      });

      await queryRunner.commitTransaction();
      LoggerHelper(`Orden ${order.id} vencida - stock liberado`, 'OrdersExpirationService');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
