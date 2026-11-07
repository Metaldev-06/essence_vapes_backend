import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import accountSecurityConfig from './config/account-security.config';
import authConfig from './config/auth.config';
import cloudinaryConfig from './config/cloudinary.config';
import { envValidationSchema } from './config/env.validation';
import legalConfig from './config/legal.config';
import openrouterConfig from './config/openrouter.config';
import resendConfig from './config/resend.config';
import securityConfig from './config/security.config';
import { AccountSecurityModule } from './features/account-security/account-security.module';
import { AuthModule } from './features/auth/auth.module';
import { CartModule } from './features/cart/cart.module';
import { ContactModule } from './features/contact/contact.module';
import { FavoritesModule } from './features/favorites/favorites.module';
import { HealthModule } from './features/health/health.module';
import { LegalInfoModule } from './features/legal-info/legal-info.module';
import { ProductsModule } from './features/products/products.module';
import { IpBlockGuard } from './features/security/ip-block.guard';
import { SecurityModule } from './features/security/security.module';
import { WithdrawalRequestsModule } from './features/withdrawal-requests/withdrawal-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        cloudinaryConfig,
        authConfig,
        openrouterConfig,
        legalConfig,
        resendConfig,
        securityConfig,
        accountSecurityConfig,
      ],
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'essence-vapes.sqlite',
      synchronize: true,
      autoLoadEntities: true,
    }),
    // Un solo throttler nombrado "default" - cada ruta lo overridea con `@Throttle({default:{...}})`
    // cuando necesita un límite distinto al genérico (ver BACKEND_SECURITY.md).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('security.throttle.globalTtlMs')!,
            limit: configService.get<number>('security.throttle.globalMax')!,
          },
        ],
      }),
    }),
    SecurityModule,
    AccountSecurityModule,
    HealthModule,
    AuthModule,
    ProductsModule,
    FavoritesModule,
    CartModule,
    LegalInfoModule,
    WithdrawalRequestsModule,
    ContactModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Orden importa: IpBlockGuard corta primero (antes de gastar un slot del throttler en una
    // IP ya bloqueada), después el throttling genérico por IP/usuario.
    { provide: APP_GUARD, useClass: IpBlockGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
