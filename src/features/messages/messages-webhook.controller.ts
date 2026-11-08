import { BadRequestException, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Repository } from 'typeorm';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { ResendInboxAdapter } from './adapters/resend-inbox.adapter';
import { MessageThreadState } from './entities/message-thread-state.entity';
import { WebhookEventLog } from './entities/webhook-event-log.entity';
import { InboxAddress } from './enums/inbox-address.enum';
import { verifyResendWebhook } from './helpers/webhook-signature.helper';
import { MessagesRealtimeService } from './messages-realtime.service';

/**
 * Endpoint público (sin `@Auth`) que recibe los webhooks de Resend - la seguridad acá es
 * exclusivamente la firma Svix, no un JWT. Nunca confía en nada del body hasta verificarla.
 * Montado aparte de `MessagesController` justamente para dejar claro que NO hereda su guard de
 * admin (sería incorrecto: Resend no tiene un JWT nuestro para mandar).
 */
@Controller('messages/webhooks')
export class MessagesWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly adapter: ResendInboxAdapter,
    private readonly realtime: MessagesRealtimeService,
    @InjectRepository(WebhookEventLog)
    private readonly webhookEvents: Repository<WebhookEventLog>,
    @InjectRepository(MessageThreadState)
    private readonly threadStates: Repository<MessageThreadState>,
  ) {}

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ): Promise<{ received: true }> {
    const webhookSecret = this.configService.get<string>('resend.webhookSecret');
    const client = this.adapter.client;

    if (!webhookSecret || !client) {
      // No configurado todavía (ver EMAIL_CRM.md, paso manual pendiente) - 200 igual para que
      // Resend no reintente infinitamente algo que nunca vamos a poder procesar sin el secret,
      // pero lo logueamos fuerte porque es una señal real de que falta un paso de setup.
      LoggerHelper(
        'Llegó un webhook de Resend pero RESEND_WEBHOOK_SECRET/RESEND_API_KEY no están configurados',
        'MessagesWebhookController',
        true,
      );
      return { received: true };
    }

    const rawBody = req.rawBody?.toString('utf-8');
    if (!rawBody) throw new BadRequestException('Body crudo no disponible');

    const event = verifyResendWebhook(
      client,
      rawBody,
      { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    );
    if (!event) throw new BadRequestException('Firma de webhook inválida');

    // Idempotencia: el `svix-id` es estable entre reintentos de un mismo evento - si ya lo
    // procesamos, 200 inmediato sin repetir ningún efecto (nunca se procesa dos veces).
    if (svixId) {
      const alreadyProcessed = await this.webhookEvents.findOne({ where: { resendEventId: svixId } });
      if (alreadyProcessed) return { received: true };
    }

    await this.process(event);

    if (svixId) {
      await this.webhookEvents.save(this.webhookEvents.create({ resendEventId: svixId, type: event.type }));
    }

    return { received: true };
  }

  private async process(event: { type: string; data?: unknown }): Promise<void> {
    switch (event.type) {
      case 'inbox.email.received': {
        const data = event.data as { inbox_id: string; thread_id: string };
        const inbox = await this.resolveInboxByInboxId(data.inbox_id);
        if (!inbox) return;

        const state = await this.getOrCreateState(inbox, data.thread_id);
        if (!state.firstReceivedAt) {
          state.firstReceivedAt = new Date();
          await this.threadStates.save(state);
        }

        this.realtime.emit({ type: 'thread.new_email', inbox, threadId: data.thread_id });
        return;
      }
      case 'inbox.thread.folder.updated':
      case 'inbox.thread.labels.updated':
      case 'inbox.thread.assigned':
      case 'inbox.thread.unassigned': {
        const data = event.data as { inbox_id: string; thread_id: string };
        const inbox = await this.resolveInboxByInboxId(data.inbox_id);
        if (!inbox) return;
        this.realtime.emit({ type: 'thread.updated', inbox, threadId: data.thread_id });
        return;
      }
      // El resto (draft.*, email.sent/delivered/bounced/etc, inbox.email.sent) no necesita
      // acción local todavía - se leen en vivo desde Resend cuando el admin abre la conversación.
      default:
        return;
    }
  }

  private resolveInboxByInboxId(inboxId: string) {
    return this.adapter.inboxOfId(inboxId);
  }

  private async getOrCreateState(inbox: InboxAddress, threadId: string) {
    const existing = await this.threadStates.findOne({ where: { resendThreadId: threadId } });
    if (existing) return existing;
    return this.threadStates.save(this.threadStates.create({ resendThreadId: threadId, inbox }));
  }
}
