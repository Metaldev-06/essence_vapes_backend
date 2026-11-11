import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailModule } from '../../common/services/email/email.module';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentAttempt, PaymentWebhookEvent]),
    AuthModule,
    OrdersModule,
    EmailModule,
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, MercadoPagoService],
})
export class PaymentsModule {}
