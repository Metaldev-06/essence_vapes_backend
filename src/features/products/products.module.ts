import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryModule } from '../../common/services/cloudinary/cloudinary.module';
import { AuthModule } from '../auth/auth.module';
import { FragranceAiService } from './ai/fragrance-ai.service';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductVariant]),
    CloudinaryModule,
    AuthModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, FragranceAiService],
  exports: [ProductsService],
})
export class ProductsModule {}
