import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartItem } from './entities/cart-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CartItem, Product, ProductVariant]),
    AuthModule,
  ],
  controllers: [CartController],
  providers: [CartService],
  // Exportado para que `OrdersModule` reutilice la misma revalidación de stock en vez de
  // duplicarla (ver `OrdersService.createFromCart`).
  exports: [CartService],
})
export class CartModule {}
