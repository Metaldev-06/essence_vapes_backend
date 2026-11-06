import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import authConfig from './config/auth.config';
import cloudinaryConfig from './config/cloudinary.config';
import { envValidationSchema } from './config/env.validation';
import legalConfig from './config/legal.config';
import openrouterConfig from './config/openrouter.config';
import { AuthModule } from './features/auth/auth.module';
import { CartModule } from './features/cart/cart.module';
import { FavoritesModule } from './features/favorites/favorites.module';
import { LegalInfoModule } from './features/legal-info/legal-info.module';
import { ProductsModule } from './features/products/products.module';
import { WithdrawalRequestsModule } from './features/withdrawal-requests/withdrawal-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [cloudinaryConfig, authConfig, openrouterConfig, legalConfig],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'essence-vapes.sqlite',
      synchronize: true,
      autoLoadEntities: true,
    }),
    AuthModule,
    ProductsModule,
    FavoritesModule,
    CartModule,
    LegalInfoModule,
    WithdrawalRequestsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
