import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Resend } from 'resend';
import type {
  Attachment,
  InboxMessage,
  InboxMessageFolder,
  InboxThread,
  InboxThreadSearchResult,
  MoveThreadFolder,
} from 'resend';

import { LoggerHelper } from '../../../common/helpers/logger.helper';
import { InboxAddress } from '../enums/inbox-address.enum';
import { RateLimiter } from '../helpers/rate-limiter';
import { resolveInboxAddress } from '../helpers/resolve-inbox-address.helper';

/**
 * Resend permite 10 req/seg por cuenta - el límite es de LA CUENTA, no de este proceso: otro
 * proceso corriendo en paralelo contra la misma cuenta (ej. un segundo backend de prueba en otro
 * puerto durante desarrollo, o `EmailService` mandando transaccionales al mismo tiempo) consume
 * del mismo cupo y no pasa por este limitador. 6/seg deja margen real para eso - confirmado en
 * vivo que 8/seg todavía podía chocar con tráfico externo concurrente.
 */
const RESEND_MAX_REQUESTS_PER_SECOND = 6;

/**
 * Resend's pagination type only accepts `after` XOR `before`, never both as keys on the same
 * object (even as `undefined`) - this picks exactly one to spread in, `after` taking precedence
 * if a caller somehow passed both (the DTOs below never do).
 */
function cursor(params: { after?: string; before?: string }): { after: string } | { before: string } | object {
  if (params.after) return { after: params.after };
  if (params.before) return { before: params.before };
  return {};
}

/**
 * Varios de los métodos "RequireAtLeastOne" del SDK (`reply`, `updateThread`, `createDraft`,
 * `updateDraft`) tipan sus campos opcionales como "si está la clave, el valor NO puede ser
 * `undefined`" - pasarles `{ html: undefined }` explícito (en vez de simplemente omitir la
 * clave) no tipa contra ese union aunque en runtime sea equivalente. Esto saca toda clave cuyo
 * valor sea `undefined` antes de mandar el objeto, y el cast queda acotado a este único punto en
 * vez de desparramar `as` por cada llamada.
 */
function withoutUndefined<T extends object>(obj: T): T {
  const result = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}

export interface ListThreadsParams {
  readonly folders?: InboxMessageFolder[];
  readonly read?: boolean;
  readonly labels?: string[];
  readonly limit?: number;
  readonly after?: string;
  readonly before?: string;
}

export interface SearchThreadsParams extends ListThreadsParams {
  readonly query?: string;
  readonly from?: string[];
  readonly hasAttachment?: boolean;
}

export interface ReplyParams {
  readonly threadId: string;
  readonly emailId: string;
  readonly html?: string;
  readonly text?: string;
  readonly cc?: string[];
  readonly bcc?: string[];
  readonly attachments?: Attachment[];
  readonly idempotencyKey?: string;
}

/**
 * Único punto de contacto con la API de Resend Inboxes - el resto del módulo nunca importa
 * `resend` directo. Esto es lo que el pedido original llamó "adaptador de servicios": si algún
 * día Inboxes deja de ser viable (límite de plan, deprecación, lo que sea), solo este archivo
 * cambia, no `messages.service.ts` ni el controller.
 *
 * Cada bandeja se referencia por `emailAddress` (no por `inboxId`) - evita tener que guardar/
 * mantener 3 UUIDs en config; Resend resuelve el id internamente (`InboxSelector` lo soporta
 * directo, ver el SDK instalado).
 */
@Injectable()
export class ResendInboxAdapter {
  private readonly resend: Resend | null;
  private readonly addresses: Record<InboxAddress, string>;
  /** Comparte un único limitador entre TODAS las llamadas salientes a Resend de este adaptador
   *  (`@Injectable()` sin scope -> singleton), así que una ráfaga de requests en paralelo (varias
   *  bandejas a la vez, varios admins conectados) siempre se pacea de forma global, no por-request. */
  private readonly rateLimiter = new RateLimiter(RESEND_MAX_REQUESTS_PER_SECOND);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resend.apiKey');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.addresses = {
      [InboxAddress.CONTACTO]: this.configService.get<string>('resend.fromContact')!,
      [InboxAddress.VENTAS]: this.configService.get<string>('resend.fromSales')!,
      [InboxAddress.SOPORTE]: this.configService.get<string>('resend.fromSupport')!,
    };
  }

  /** Expuesto para que el webhook controller pueda verificar firmas sin instanciar su propio SDK. */
  get client(): Resend | null {
    return this.resend;
  }

  addressOf(inbox: InboxAddress): string {
    return this.addresses[inbox];
  }

  /** `null` si la dirección no es una de las 3 bandejas reales (ej. llegó algo a `no-reply@`). */
  inboxOf(emailAddress: string): InboxAddress | null {
    return resolveInboxAddress(this.addresses, emailAddress);
  }

  /** Resuelve un `inbox_id` (UUID de Resend, lo único que trae el payload del webhook) a
   *  nuestro enum - una llamada a la API, sin mantener un segundo mapeo id->bandeja local. */
  async inboxOfId(inboxId: string): Promise<InboxAddress | null> {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() => resend.inboxes.get(inboxId));
    if (error || !data) return null;
    return this.inboxOf(data.email_address);
  }

  private requireClient(): Resend {
    if (!this.resend) {
      throw new ServiceUnavailableException(
        'El centro de mensajes no está disponible: RESEND_API_KEY no está configurada',
      );
    }
    return this.resend;
  }

  async listInboxesSummary(): Promise<Array<{ inbox: InboxAddress; unread: number }>> {
    const resend = this.requireClient();
    const results = await Promise.all(
      (Object.values(InboxAddress) as InboxAddress[]).map(async (inbox) => {
        const { data, error } = await this.rateLimiter.schedule(() =>
          resend.inboxes.get(this.addressOf(inbox)),
        );
        if (error || !data) {
          LoggerHelper(`No se pudo leer la bandeja ${inbox}: ${error?.message}`, 'ResendInboxAdapter', true);
          return { inbox, unread: 0 };
        }
        return { inbox, unread: data.unread };
      }),
    );
    return results;
  }

  async listThreads(
    inbox: InboxAddress,
    params: ListThreadsParams,
  ): Promise<{ data: InboxThread[]; hasMore: boolean }> {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.list({
        emailAddress: this.addressOf(inbox),
        folders: params.folders,
        read: params.read,
        labels: params.labels,
        limit: params.limit,
        ...cursor(params),
      }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'error listando threads'}`);
    return { data: data.data, hasMore: data.has_more };
  }

  async searchThreads(
    inbox: InboxAddress,
    params: SearchThreadsParams,
  ): Promise<{ data: InboxThreadSearchResult[]; hasMore: boolean }> {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.search({
        emailAddress: this.addressOf(inbox),
        query: params.query,
        from: params.from,
        folders: params.folders,
        labels: params.labels,
        read: params.read,
        hasAttachment: params.hasAttachment,
        limit: params.limit,
        ...cursor(params),
      }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'error buscando threads'}`);
    return { data: data.data, hasMore: data.has_more };
  }

  async getThread(inbox: InboxAddress, threadId: string) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.get({ emailAddress: this.addressOf(inbox), threadId }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'thread no encontrado'}`);
    return data;
  }

  async listThreadEmails(
    inbox: InboxAddress,
    threadId: string,
    params: { limit?: number; after?: string } = {},
  ): Promise<{ data: InboxMessage[]; hasMore: boolean }> {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.emails.list({
        emailAddress: this.addressOf(inbox),
        threadId,
        limit: params.limit,
        after: params.after,
      }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'error listando emails'}`);
    return { data: data.data, hasMore: data.has_more };
  }

  async getThreadEmail(inbox: InboxAddress, threadId: string, emailId: string): Promise<InboxMessage> {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.emails.get({ emailAddress: this.addressOf(inbox), threadId, emailId }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'email no encontrado'}`);
    return data;
  }

  async reply(inbox: InboxAddress, params: ReplyParams): Promise<{ id: string }> {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.emails.reply(
        withoutUndefined({
          emailAddress: this.addressOf(inbox),
          threadId: params.threadId,
          emailId: params.emailId,
          html: params.html,
          text: params.text,
          cc: params.cc,
          bcc: params.bcc,
          attachments: params.attachments,
        }) as Parameters<typeof resend.inboxes.threads.emails.reply>[0],
        params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
      ),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'no se pudo responder'}`);
    return data;
  }

  async updateThread(
    inbox: InboxAddress,
    threadId: string,
    changes: { read?: boolean; folder?: MoveThreadFolder },
  ) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.update(
        withoutUndefined({
          emailAddress: this.addressOf(inbox),
          threadId,
          ...changes,
        }) as Parameters<typeof resend.inboxes.threads.update>[0],
      ),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'no se pudo actualizar el thread'}`);
    return data;
  }

  async listLabels(inbox: InboxAddress) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.labels.list({ emailAddress: this.addressOf(inbox) }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'error listando etiquetas'}`);
    return data.data;
  }

  async createLabel(inbox: InboxAddress, name: string, color?: string) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.labels.create({ emailAddress: this.addressOf(inbox), name, color }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'no se pudo crear la etiqueta'}`);
    return data;
  }

  async setThreadLabels(inbox: InboxAddress, threadId: string, labelIds: string[]) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.threads.labels.set({
        emailAddress: this.addressOf(inbox),
        threadId,
        labels: labelIds,
      }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'no se pudieron setear etiquetas'}`);
    return data.data;
  }

  async listDrafts(inbox: InboxAddress) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.drafts.list({ emailAddress: this.addressOf(inbox) }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'error listando borradores'}`);
    return data.data;
  }

  async getDraft(inbox: InboxAddress, draftId: string) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.drafts.get({ emailAddress: this.addressOf(inbox), draftId }),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'borrador no encontrado'}`);
    return data;
  }

  async createDraft(
    inbox: InboxAddress,
    params: {
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      html?: string;
      text?: string;
      threadId?: string;
      replyToEmailId?: string;
    },
  ) {
    const resend = this.requireClient();
    const base = withoutUndefined({
      emailAddress: this.addressOf(inbox),
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.drafts.create(
        (params.threadId && params.replyToEmailId
          ? { ...base, threadId: params.threadId, replyToEmailId: params.replyToEmailId }
          : base) as Parameters<typeof resend.inboxes.drafts.create>[0],
      ),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'no se pudo crear el borrador'}`);
    return data;
  }

  async updateDraft(
    inbox: InboxAddress,
    draftId: string,
    params: { to?: string[]; cc?: string[]; bcc?: string[]; subject?: string; html?: string; text?: string },
  ) {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.drafts.update(
        withoutUndefined({
          emailAddress: this.addressOf(inbox),
          draftId,
          ...params,
        }) as Parameters<typeof resend.inboxes.drafts.update>[0],
      ),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'no se pudo actualizar el borrador'}`);
    return data;
  }

  async removeDraft(inbox: InboxAddress, draftId: string): Promise<void> {
    const resend = this.requireClient();
    const { error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.drafts.remove({ emailAddress: this.addressOf(inbox), draftId }),
    );
    if (error) throw new ServiceUnavailableException(`Resend: ${error.message}`);
  }

  async sendDraft(inbox: InboxAddress, draftId: string, idempotencyKey?: string): Promise<{ id: string }> {
    const resend = this.requireClient();
    const { data, error } = await this.rateLimiter.schedule(() =>
      resend.inboxes.drafts.send(
        { emailAddress: this.addressOf(inbox), draftId },
        idempotencyKey ? { idempotencyKey } : undefined,
      ),
    );
    if (error || !data) throw new ServiceUnavailableException(`Resend: ${error?.message ?? 'no se pudo enviar el borrador'}`);
    return data;
  }
}
