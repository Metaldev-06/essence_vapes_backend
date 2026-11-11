import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailModule } from '../../common/services/email/email.module';
import { PaginationService } from '../../common/services/pagination/pagination.service';
import { Address } from '../addresses/entities/address.entity';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { CartModule } from '../cart/cart.module';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { OrdersExpirationService } from './orders-expiration.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Address, User, Product, ProductVariant]),
    AuthModule,
    CartModule,
    EmailModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersExpirationService, PaginationService],
  // `PaymentsModule` necesita crear/leer órdenes y marcarlas pagadas.
  exports: [OrdersService],
})
export class OrdersModule {}
