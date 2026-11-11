import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { verifyMercadoPagoSignature } from './helpers/mp-webhook-signature.helper';
import { MercadoPagoService } from './mercadopago.service';
import { PaymentsService } from './payments.service';

interface MercadoPagoWebhookBody {
  id?: number | string;
  type?: string;
  action?: string;
  data?: { id?: string };
}

/**
 * Endpoint público (sin `@Auth`) para las notificaciones de Mercado Pago - la seguridad acá es
 * exclusivamente la firma `X-Signature`, no un JWT. Nunca confía en el body de la notificación
 * para actualizar una orden: siempre vuelve a consultar el recurso real contra la API de MP
 * antes de tocar cualquier estado (ver `PaymentsService.reconcileFromMercadoPagoOrder`).
 */
@Controller('payments/webhooks')
export class PaymentsWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly paymentsService: PaymentsService,
    @InjectRepository(PaymentWebhookEvent)
    private readonly webhookEvents: Repository<PaymentWebhookEvent>,
  ) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Query('data.id') queryDataId: string | undefined,
    @Query('type') queryType: string | undefined,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Body() body: MercadoPagoWebhookBody,
  ): Promise<{ received: true }> {
    const secret = this.configService.get<string>('mercadopago.webhookSecret');
    if (!secret) {
      // No configurado todavía - 200 igual para que MP no reintente algo que nunca vamos a poder
      // procesar sin el secret (mismo criterio que `MessagesWebhookController`), pero logueado
      // fuerte porque es una señal real de que falta un paso de setup.
      LoggerHelper(
        'Llegó un webhook de Mercado Pago pero MERCADOPAGO_WEBHOOK_SECRET no está configurado',
        'PaymentsWebhookController',
        true,
      );
      return { received: true };
    }

    const dataId = queryDataId ?? body?.data?.id;
    const isValid = verifyMercadoPagoSignature({ dataId, xRequestId, xSignature, secret });
    if (!isValid) throw new BadRequestException('Firma de webhook inválida');

    // Idempotencia: el `id` propio de la notificación es estable entre reintentos del mismo
    // evento - si ya lo procesamos, 200 inmediato sin repetir ningún efecto.
    const notificationId = body?.id != null ? String(body.id) : undefined;
    if (notificationId) {
      const alreadyProcessed = await this.webhookEvents.findOne({ where: { notificationId } });
      if (alreadyProcessed) return { received: true };
    }

    const topic = queryType ?? body?.type;
    if (topic === 'order' && dataId) {
      const mpOrder = await this.mercadoPagoService.getOrder(dataId);
      await this.paymentsService.reconcileFromMercadoPagoOrder(mpOrder);
    }
    // Otros tópicos (payment, merchant_order, chargebacks, etc.) todavía no tienen acción propia
    // en esta integración - se reconocen sin efecto, mismo criterio que
    // `MessagesWebhookController` con los tipos de evento que no maneja.

    if (notificationId) {
      await this.webhookEvents.save(
        this.webhookEvents.create({
          notificationId,
          topic: topic ?? 'unknown',
          resourceId: dataId ?? 'unknown',
        }),
      );
    }

    return { received: true };
  }
}
