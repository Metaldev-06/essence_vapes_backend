import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import { LoggerHelper } from '../../common/helpers/logger.helper';
import { EmailService } from '../../common/services/email/email.service';
import { Order } from '../orders/entities/order.entity';
import { PaymentStatus } from '../orders/enums/payment-status.enum';
import { OrdersService } from '../orders/orders.service';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { mapMercadoPagoStatus } from './helpers/mp-status-mapper.helper';
import { splitFullName } from './helpers/split-full-name.helper';
import { MercadoPagoService, type MpOrderResponse } from './mercadopago.service';
import {
  buildPaymentApprovedEmail,
  buildPaymentPendingEmail,
  buildPaymentRejectedEmail,
  buildRefundConfirmedEmail,
} from './payment-emails';

/** Máx. 13 caracteres - límite de la mayoría de las redes de tarjetas para el resumen
 *  (checklist de calidad oficial de MP: `statement_descriptor_/_soft_descriptor`). */
const STATEMENT_DESCRIPTOR = 'ESSENCEVAPES';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly attemptsRepository: Repository<PaymentAttempt>,
    private readonly ordersService: OrdersService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Procesa un intento de pago con el `formData` que entrega el Payment Brick. El monto NUNCA
   * sale del `formData` del cliente - siempre se toma de `order.totalValue`, ya recalculado por
   * el backend al crear la orden. Permite reintentar (una orden rechazada puede volver a
   * intentarse mientras no haya vencido - ver `OrdersService.getPayableOrderOrThrow`), cada
   * intento con su propia `X-Idempotency-Key`.
   */
  async processPayment(userId: string, dto: ProcessPaymentDto, deviceId?: string) {
    const order = await this.ordersService.getPayableOrderOrThrow(userId, dto.orderId);
    const { items } = await this.ordersService.getOrderWithItems(order.id);
    const idempotencyKey = randomUUID();
    const amount = order.totalValue.toFixed(2);
    const { firstName, lastName } = splitFullName(order.buyerName);

    const attempt = this.attemptsRepository.create({
      orderId: order.id,
      idempotencyKey,
      status: PaymentStatus.PENDING,
    });
    await this.attemptsRepository.save(attempt);

    try {
      const mpResponse = await this.mercadoPagoService.createOrder(
        {
          type: 'online',
          processing_mode: 'automatic',
          total_amount: amount,
          external_reference: order.id,
          description: 'Compra en Essence Vapes',
          payer: {
            email: dto.payer.email || order.buyerEmail,
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            phone: order.buyerPhone ? { number: order.buyerPhone } : undefined,
            address: {
              zip_code: order.shippingAddress.postalCode,
              street_name: order.shippingAddress.street,
              street_number: order.shippingAddress.streetNumber,
            },
            identification: dto.payer.identification,
          },
          // Mejora de tasa de aprobación (checklist de calidad oficial) - nunca se manda
          // `category_id` por ítem: no hay una lista confirmada de categorías válidas para
          // Argentina en la documentación revisada, mejor omitirlo que inventar un valor.
          // `external_code` truncado a 30 caracteres - límite real de la Orders API, hit en vivo
          // contra un slug de producto más largo (ver COMPLIANCE/incidente 2026-11-11).
          items: items.map((item) => ({
            title: item.productName,
            unit_price: item.unitPriceValue.toFixed(2),
            quantity: item.quantity,
            description: item.variantLabel ?? undefined,
            external_code: item.productId.slice(0, 30),
          })),
          transactions: {
            payments: [
              {
                amount,
                payment_method: {
                  id: dto.paymentMethodId,
                  type: dto.paymentMethodType,
                  token: dto.token,
                  installments: dto.installments,
                  // `issuer_id` NO es una propiedad soportada en `payment_method` de la Orders
                  // API (confirmado en vivo: 400 "additionalProperties 'issuer_id' not allowed",
                  // a diferencia de la Payments API clásica) - no se manda, aunque el DTO lo
                  // siga aceptando del Brick por si alguna vez se documenta dónde va.
                  statement_descriptor: STATEMENT_DESCRIPTOR,
                },
              },
            ],
          },
        },
        idempotencyKey,
        deviceId,
      );

      return this.recordAttemptResult(attempt, order, mpResponse);
    } catch (error) {
      attempt.status = PaymentStatus.REJECTED;
      attempt.failureReason = error instanceof Error ? error.message : 'Error desconocido';
      await this.attemptsRepository.save(attempt);
      throw error;
    }
  }

  /** Panel admin: historial de intentos de pago de una orden (incluye los id de Mercado Pago -
   *  ver COMPLIANCE/tarea: el admin necesita poder ubicar la operación del lado de MP). */
  async getAttemptsForOrder(orderId: string): Promise<PaymentAttempt[]> {
    return this.attemptsRepository.find({ where: { orderId }, order: { createdAt: 'DESC' } });
  }

  /** Llamado por `PaymentsWebhookController` tras confirmar el recurso directo con Mercado Pago. */
  async reconcileFromMercadoPagoOrder(mpOrderResponse: MpOrderResponse): Promise<void> {
    const attempt = await this.attemptsRepository.findOne({
      where: { mpOrderId: mpOrderResponse.id },
    });
    if (!attempt) {
      LoggerHelper(
        `Webhook de Mercado Pago para una order sin intento registrado: ${mpOrderResponse.id}`,
        'PaymentsService',
        true,
      );
      return;
    }

    const { order } = await this.ordersService.getOrderWithItems(attempt.orderId);
    await this.recordAttemptResult(attempt, order, mpOrderResponse);
  }

  private async recordAttemptResult(
    attempt: PaymentAttempt,
    order: Order,
    mpResponse: MpOrderResponse,
  ) {
    const transactionPayment = mpResponse.transactions?.payments?.[0];
    const paymentStatus = mapMercadoPagoStatus(mpResponse.status);

    attempt.mpOrderId = mpResponse.id;
    attempt.mpPaymentId = transactionPayment?.id ?? null;
    attempt.status = paymentStatus;
    attempt.statusDetail = transactionPayment?.status_detail ?? mpResponse.status_detail ?? null;
    try {
      await this.attemptsRepository.save(attempt);
    } catch (error) {
      HandleDBExceptions(error, 'PaymentsService.recordAttemptResult');
    }

    const previousStatus = order.paymentStatus;
    const updatedOrder = await this.ordersService.applyPaymentResult(order.id, paymentStatus);

    if (previousStatus !== paymentStatus) {
      void this.notifyPaymentStatus(updatedOrder);
    }

    return {
      orderId: updatedOrder.id,
      orderStatus: updatedOrder.status,
      paymentStatus: updatedOrder.paymentStatus,
      statusDetail: attempt.statusDetail ?? undefined,
    };
  }

  /**
   * Nunca se avisa "aprobado" (ni ningún otro estado) hasta que esta misma función se llamó
   * *después* de confirmar el estado real contra Mercado Pago (ver los dos call sites arriba) -
   * nunca se dispara desde algo que el frontend reportó por su cuenta. Emails con la identidad
   * visual del resto del proyecto (`buildAccountEmailHtml`, ver `payment-emails.ts`) - uno de
   * los 5 tipos que pide la tarea (el de "orden creada" vive en `OrdersService`).
   */
  private async notifyPaymentStatus(order: Order): Promise<void> {
    const { sales } = this.emailService.addresses;
    const frontendUrl = this.configService.get<string>('accountSecurity.frontendUrl')!;
    const attempt = order.paymentStatus === PaymentStatus.REJECTED
      ? await this.attemptsRepository.findOne({ where: { orderId: order.id }, order: { createdAt: 'DESC' } })
      : null;

    const emailOptions = (() => {
      switch (order.paymentStatus) {
        case PaymentStatus.APPROVED:
          return buildPaymentApprovedEmail(sales, order, frontendUrl);
        case PaymentStatus.REJECTED:
          return buildPaymentRejectedEmail(sales, order, frontendUrl, attempt?.statusDetail ?? undefined);
        case PaymentStatus.IN_PROCESS:
          return buildPaymentPendingEmail(sales, order, frontendUrl);
        case PaymentStatus.REFUNDED:
          return buildRefundConfirmedEmail(sales, order, frontendUrl);
        default:
          return null;
      }
    })();
    if (!emailOptions) return;

    const sent = await this.emailService.send(emailOptions);
    if (!sent) {
      LoggerHelper(
        `No se pudo enviar el email de estado de pago para la orden ${order.id}`,
        'PaymentsService',
        true,
      );
    }
  }
}
