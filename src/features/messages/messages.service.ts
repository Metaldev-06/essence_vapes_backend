import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import type { Attachment, InboxThread, InboxThreadSearchResult, MoveThreadFolder } from 'resend';

import { Role } from '../../common/enums/system-role.enum';
import { User } from '../auth/entities/user.entity';
import { ResendInboxAdapter } from './adapters/resend-inbox.adapter';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './dto/canned-response.dto';
import { CreateDraftDto, UpdateDraftDto } from './dto/draft.dto';
import { ListThreadsQueryDto } from './dto/list-threads-query.dto';
import { ReplyThreadDto } from './dto/reply-thread.dto';
import { UpdateSignatureDto } from './dto/update-signature.dto';
import { UpdateThreadStateDto } from './dto/update-thread-state.dto';
import { CannedResponse } from './entities/canned-response.entity';
import { InboxSignature } from './entities/inbox-signature.entity';
import { MessageAuditLog } from './entities/message-audit-log.entity';
import { MessageNote } from './entities/message-note.entity';
import { MessageThreadState } from './entities/message-thread-state.entity';
import { InboxAddress } from './enums/inbox-address.enum';
import { ThreadPriority } from './enums/thread-priority.enum';
import { ThreadStatus } from './enums/thread-status.enum';
import {
  applyCannedResponseVariables,
  type CannedResponseVariables,
} from './helpers/canned-response-variables.helper';
import { sanitizeInboundEmailHtml, sanitizeOutboundEmailHtml } from './helpers/sanitize-email-html.helper';
import { MessagesRealtimeService } from './messages-realtime.service';

const DEFAULT_SIGNATURES: Record<InboxAddress, string> = {
  [InboxAddress.CONTACTO]: 'Equipo de Essence Vapes\ncontacto@essencevapes.com.ar\nwww.essencevapes.com.ar',
  [InboxAddress.VENTAS]: 'Área de Ventas\nEssence Vapes\nventas@essencevapes.com.ar',
  [InboxAddress.SOPORTE]: 'Atención al Cliente\nEssence Vapes\nsoporte@essencevapes.com.ar',
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface ReplyFileInput {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
  readonly size: number;
}

export interface AdminActor {
  readonly id: string;
  readonly email: string;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly adapter: ResendInboxAdapter,
    private readonly realtime: MessagesRealtimeService,
    @InjectRepository(MessageThreadState)
    private readonly threadStates: Repository<MessageThreadState>,
    @InjectRepository(MessageNote)
    private readonly notes: Repository<MessageNote>,
    @InjectRepository(CannedResponse)
    private readonly cannedResponses: Repository<CannedResponse>,
    @InjectRepository(InboxSignature)
    private readonly signatures: Repository<InboxSignature>,
    @InjectRepository(MessageAuditLog)
    private readonly auditLogs: Repository<MessageAuditLog>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  // ---------------------------------------------------------------------------------------
  // Bandejas / listado
  // ---------------------------------------------------------------------------------------

  async listInboxesSummary() {
    return this.adapter.listInboxesSummary();
  }

  /**
   * Sin `inbox` en el query: consulta las 3 bandejas en paralelo y mergea en memoria
   * (ordenado por `received_at` desc, truncado a `limit`) - es la "bandeja unificada" del
   * pedido. Resend no ofrece un cursor combinado entre bandejas, así que esta vista unificada
   * no es cursor-paginable con precisión; paginar de verdad requiere elegir una bandeja.
   */
  async listThreads(query: ListThreadsQueryDto) {
    const limit = query.limit ?? 20;
    const folders = query.folder ? [query.folder] : undefined;

    const inboxes = query.inbox ? [query.inbox] : (Object.values(InboxAddress) as InboxAddress[]);

    const results = await Promise.all(
      inboxes.map(async (inbox) => {
        if (query.query || query.labels?.length) {
          const { data, hasMore } = await this.adapter.searchThreads(inbox, {
            query: query.query,
            folders,
            labels: query.labels,
            read: query.read,
            limit,
            after: query.after,
            before: query.before,
          });
          return { inbox, data, hasMore };
        }
        const { data, hasMore } = await this.adapter.listThreads(inbox, {
          folders,
          read: query.read,
          limit,
          after: query.after,
          before: query.before,
        });
        return { inbox, data, hasMore };
      }),
    );

    const flattened = results.flatMap(({ inbox, data }) =>
      data.map((thread) => ({ inbox, thread })),
    );
    flattened.sort(
      (a, b) => new Date(b.thread.received_at).getTime() - new Date(a.thread.received_at).getTime(),
    );
    const page = flattened.slice(0, limit);

    const states = await this.getStatesFor(page.map((p) => p.thread.id));

    return {
      data: page.map(({ inbox, thread }) => this.toThreadSummary(inbox, thread, states.get(thread.id))),
      hasMore: results.some((r) => r.hasMore),
    };
  }

  private async getStatesFor(threadIds: string[]): Promise<Map<string, MessageThreadState>> {
    if (threadIds.length === 0) return new Map();
    const rows = await this.threadStates.find({ where: { resendThreadId: In(threadIds) } });
    return new Map(rows.map((row) => [row.resendThreadId, row]));
  }

  private toThreadSummary(
    inbox: InboxAddress,
    thread: InboxThread | InboxThreadSearchResult,
    state: MessageThreadState | undefined,
  ) {
    return {
      id: thread.id,
      inbox,
      subject: thread.subject,
      from: thread.from,
      to: thread.to,
      labels: thread.labels,
      emailCount: thread.email_count,
      hasAttachment: thread.has_attachment,
      hasDraft: thread.has_draft,
      read: thread.read,
      receivedAt: thread.received_at,
      folder: thread.folder,
      status: state?.status ?? ThreadStatus.NUEVO,
      priority: state?.priority ?? ThreadPriority.MEDIA,
      starred: state?.starred ?? false,
      assignedAdminId: state?.assignedAdminId ?? null,
    };
  }

  /** Crea la fila local la primera vez que algo toca un thread - nunca hace falta "sincronizar"
   *  de antemano (ver nota de la entidad). */
  private async getOrCreateState(inbox: InboxAddress, threadId: string): Promise<MessageThreadState> {
    const existing = await this.threadStates.findOne({ where: { resendThreadId: threadId } });
    if (existing) return existing;
    return this.threadStates.save(
      this.threadStates.create({ resendThreadId: threadId, inbox }),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Detalle de conversación
  // ---------------------------------------------------------------------------------------

  async getThreadDetail(inbox: InboxAddress, threadId: string) {
    const [thread, emailsPage, state, notes] = await Promise.all([
      this.adapter.getThread(inbox, threadId),
      this.adapter.listThreadEmails(inbox, threadId, { limit: 100 }),
      this.getOrCreateState(inbox, threadId),
      this.notes.find({ where: { resendThreadId: threadId }, order: { createdAt: 'ASC' } }),
    ]);

    const emails = emailsPage.data
      .slice()
      .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())
      .map((email) => ({
        id: email.id,
        direction: email.direction,
        from: email.from,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        html: email.html ? sanitizeInboundEmailHtml(email.html) : null,
        text: email.text,
        attachments: email.attachments,
        read: email.read,
        receivedAt: email.received_at,
      }));

    // Primera vez que vemos este thread con emails reales: capturamos el momento del primer
    // entrante, una sola vez (nunca se reescribe después).
    if (!state.firstReceivedAt) {
      const firstInbound = emails.find((e) => e.direction === 'inbound');
      if (firstInbound) {
        state.firstReceivedAt = new Date(firstInbound.receivedAt);
        await this.threadStates.save(state);
      }
    }

    return {
      thread: {
        id: thread.id,
        subject: thread.subject,
        folder: thread.folder,
        labels: thread.labels,
        read: thread.read,
      },
      inbox,
      emails,
      hasMoreEmails: emailsPage.hasMore,
      status: state.status,
      priority: state.priority,
      starred: state.starred,
      assignedAdminId: state.assignedAdminId,
      notes: notes.map((n) => ({ id: n.id, body: n.body, authorName: n.authorName, createdAt: n.createdAt })),
    };
  }

  // ---------------------------------------------------------------------------------------
  // Responder
  // ---------------------------------------------------------------------------------------

  async reply(
    inbox: InboxAddress,
    threadId: string,
    emailId: string,
    dto: ReplyThreadDto,
    files: ReplyFileInput[],
    actor: AdminActor,
  ) {
    this.assertAttachmentsWithinLimits(files);

    const attachments: Attachment[] = files.map((file) => ({
      content: file.buffer,
      filename: file.originalname,
      contentType: file.mimetype,
    }));

    const html = dto.html ? sanitizeOutboundEmailHtml(dto.html) : undefined;

    const result = await this.adapter.reply(inbox, {
      threadId,
      emailId,
      html,
      text: dto.text,
      cc: dto.cc,
      bcc: dto.bcc,
      attachments: attachments.length > 0 ? attachments : undefined,
      idempotencyKey: dto.idempotencyKey,
    });

    const state = await this.getOrCreateState(inbox, threadId);
    state.lastOutboundEmailId = result.id;
    state.lastOutboundStatus = 'enviado';
    if (!state.firstRespondedAt) state.firstRespondedAt = new Date();
    await this.threadStates.save(state);

    await this.audit(actor, 'reply', threadId, `bandeja=${inbox}`);
    this.realtime.emit({ type: 'thread.updated', inbox, threadId });

    return { id: result.id };
  }

  private assertAttachmentsWithinLimits(files: ReplyFileInput[]): void {
    if (files.length > 10) throw new BadRequestException('Máximo 10 archivos adjuntos por respuesta');
    let total = 0;
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES)
        throw new BadRequestException(`"${file.originalname}" supera el tamaño máximo por archivo (10MB)`);
      total += file.size;
    }
    if (total > MAX_TOTAL_ATTACHMENT_BYTES)
      throw new BadRequestException('El total de adjuntos supera los 25MB permitidos');
  }

  // ---------------------------------------------------------------------------------------
  // Estado CRM / lectura / carpeta
  // ---------------------------------------------------------------------------------------

  async updateState(inbox: InboxAddress, threadId: string, dto: UpdateThreadStateDto, actor: AdminActor) {
    if (dto.assignedAdminId) {
      const admin = await this.users.findOne({ where: { id: dto.assignedAdminId, role: Role.ADMIN } });
      if (!admin) throw new BadRequestException('El responsable asignado debe ser un administrador existente');
    }

    const state = await this.getOrCreateState(inbox, threadId);
    const changes: string[] = [];
    if (dto.status !== undefined && dto.status !== state.status) {
      changes.push(`status: ${state.status} -> ${dto.status}`);
      state.status = dto.status;
    }
    if (dto.priority !== undefined && dto.priority !== state.priority) {
      changes.push(`priority: ${state.priority} -> ${dto.priority}`);
      state.priority = dto.priority;
    }
    if (dto.starred !== undefined && dto.starred !== state.starred) {
      changes.push(`starred: ${state.starred} -> ${dto.starred}`);
      state.starred = dto.starred;
    }
    if (dto.assignedAdminId !== undefined && dto.assignedAdminId !== state.assignedAdminId) {
      changes.push('assignedAdminId cambiado');
      state.assignedAdminId = dto.assignedAdminId;
    }

    await this.threadStates.save(state);
    if (changes.length > 0) {
      await this.audit(actor, 'update_state', threadId, changes.join('; '));
      this.realtime.emit({ type: 'thread.updated', inbox, threadId });
    }

    return state;
  }

  async setRead(inbox: InboxAddress, threadId: string, read: boolean, actor: AdminActor) {
    const result = await this.adapter.updateThread(inbox, threadId, { read });
    await this.audit(actor, read ? 'mark_read' : 'mark_unread', threadId, null);
    this.realtime.emit({ type: 'thread.updated', inbox, threadId });
    return result;
  }

  async moveToFolder(inbox: InboxAddress, threadId: string, folder: MoveThreadFolder, actor: AdminActor) {
    const result = await this.adapter.updateThread(inbox, threadId, { folder });
    await this.audit(actor, 'move_folder', threadId, `folder=${folder}`);
    this.realtime.emit({ type: 'thread.updated', inbox, threadId });
    return result;
  }

  // ---------------------------------------------------------------------------------------
  // Etiquetas (nativas de Resend - no se duplican acá)
  // ---------------------------------------------------------------------------------------

  listLabels(inbox: InboxAddress) {
    return this.adapter.listLabels(inbox);
  }

  async createLabel(inbox: InboxAddress, name: string, color: string | undefined, actor: AdminActor) {
    const label = await this.adapter.createLabel(inbox, name, color);
    await this.audit(actor, 'create_label', null, `bandeja=${inbox} nombre=${name}`);
    return label;
  }

  async setThreadLabels(inbox: InboxAddress, threadId: string, labelIds: string[], actor: AdminActor) {
    const labels = await this.adapter.setThreadLabels(inbox, threadId, labelIds);
    await this.audit(actor, 'set_labels', threadId, null);
    this.realtime.emit({ type: 'thread.updated', inbox, threadId });
    return labels;
  }

  // ---------------------------------------------------------------------------------------
  // Notas internas (nunca se mandan al cliente)
  // ---------------------------------------------------------------------------------------

  async addNote(threadId: string, body: string, actor: AdminActor & { fullName: string }) {
    const note = this.notes.create({
      resendThreadId: threadId,
      authorId: actor.id,
      authorName: actor.fullName,
      body,
    });
    await this.notes.save(note);
    await this.audit(actor, 'add_note', threadId, null);
    return note;
  }

  // ---------------------------------------------------------------------------------------
  // Respuestas rápidas / plantillas
  // ---------------------------------------------------------------------------------------

  listCannedResponses(inbox?: InboxAddress) {
    if (!inbox) return this.cannedResponses.find({ order: { title: 'ASC' } });
    return this.cannedResponses.find({
      where: [{ inbox }, { inbox: IsNull() }],
      order: { title: 'ASC' },
    });
  }

  async createCannedResponse(dto: CreateCannedResponseDto, actor: AdminActor) {
    const created = this.cannedResponses.create({ ...dto, inbox: dto.inbox ?? null });
    const saved = await this.cannedResponses.save(created);
    await this.audit(actor, 'create_canned_response', null, saved.title);
    return saved;
  }

  async updateCannedResponse(id: string, dto: UpdateCannedResponseDto, actor: AdminActor) {
    const existing = await this.cannedResponses.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Respuesta rápida no encontrada');
    Object.assign(existing, dto);
    const saved = await this.cannedResponses.save(existing);
    await this.audit(actor, 'update_canned_response', null, saved.title);
    return saved;
  }

  async removeCannedResponse(id: string, actor: AdminActor) {
    const existing = await this.cannedResponses.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Respuesta rápida no encontrada');
    await this.cannedResponses.remove(existing);
    await this.audit(actor, 'remove_canned_response', null, existing.title);
  }

  async previewCannedResponse(id: string, variables: CannedResponseVariables) {
    const existing = await this.cannedResponses.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Respuesta rápida no encontrada');
    return { body: applyCannedResponseVariables(existing.body, variables) };
  }

  // ---------------------------------------------------------------------------------------
  // Firmas
  // ---------------------------------------------------------------------------------------

  async getSignatures() {
    const all = await Promise.all(
      (Object.values(InboxAddress) as InboxAddress[]).map((inbox) => this.getOrCreateSignature(inbox)),
    );
    return all;
  }

  private async getOrCreateSignature(inbox: InboxAddress): Promise<InboxSignature> {
    const existing = await this.signatures.findOne({ where: { inbox } });
    if (existing) return existing;
    return this.signatures.save(this.signatures.create({ inbox, body: DEFAULT_SIGNATURES[inbox] }));
  }

  async updateSignature(inbox: InboxAddress, dto: UpdateSignatureDto, actor: AdminActor) {
    const signature = await this.getOrCreateSignature(inbox);
    signature.body = dto.body;
    const saved = await this.signatures.save(signature);
    await this.audit(actor, 'update_signature', null, `bandeja=${inbox}`);
    return saved;
  }

  // ---------------------------------------------------------------------------------------
  // Borradores (nativos de Resend)
  // ---------------------------------------------------------------------------------------

  listDrafts(inbox: InboxAddress) {
    return this.adapter.listDrafts(inbox);
  }

  getDraft(inbox: InboxAddress, draftId: string) {
    return this.adapter.getDraft(inbox, draftId);
  }

  async createDraft(inbox: InboxAddress, dto: CreateDraftDto, actor: AdminActor) {
    const draft = await this.adapter.createDraft(inbox, {
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject,
      html: dto.html ? sanitizeOutboundEmailHtml(dto.html) : undefined,
      text: dto.text,
      threadId: dto.threadId,
      replyToEmailId: dto.replyToEmailId,
    });
    await this.audit(actor, 'create_draft', dto.threadId ?? null, null);
    return draft;
  }

  async updateDraft(inbox: InboxAddress, draftId: string, dto: UpdateDraftDto) {
    return this.adapter.updateDraft(inbox, draftId, {
      ...dto,
      html: dto.html ? sanitizeOutboundEmailHtml(dto.html) : undefined,
    });
  }

  async removeDraft(inbox: InboxAddress, draftId: string, actor: AdminActor) {
    await this.adapter.removeDraft(inbox, draftId);
    await this.audit(actor, 'remove_draft', null, null);
  }

  async sendDraft(inbox: InboxAddress, draftId: string, idempotencyKey: string, actor: AdminActor) {
    const result = await this.adapter.sendDraft(inbox, draftId, idempotencyKey);
    await this.audit(actor, 'send_draft', null, null);
    return result;
  }

  // ---------------------------------------------------------------------------------------
  // Contactos (computado al vuelo - nunca se fusiona por nombre, solo por email exacto)
  // ---------------------------------------------------------------------------------------

  async getContact(email: string) {
    const normalized = email.toLowerCase().trim();

    const perInbox = await Promise.all(
      (Object.values(InboxAddress) as InboxAddress[]).map(async (inbox) => {
        const { data } = await this.adapter.searchThreads(inbox, { from: [normalized], limit: 50 });
        return { inbox, threads: data };
      }),
    );

    const allThreads = perInbox.flatMap(({ inbox, threads }) =>
      threads.map((t) => ({
        id: t.id,
        inbox,
        subject: t.subject,
        receivedAt: t.received_at,
        folder: t.folder,
      })),
    );
    allThreads.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

    const registeredUser = await this.users.findOne({ where: { email: normalized } });

    return {
      email: normalized,
      conversationCount: allThreads.length,
      lastContact: allThreads[0]?.receivedAt ?? null,
      threads: allThreads.slice(0, 20),
      // Solo lo mínimo para que el admin sepa "es un cliente registrado" - nunca se exponen
      // datos sensibles de la cuenta (password hash, role, direcciones, etc).
      registeredAccount: registeredUser
        ? { fullName: registeredUser.fullName, memberSince: registeredUser.createdAt }
        : null,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------------------

  async getStats(periodStart: Date | null) {
    const [inboxesSummary, statusCounts, received] = await Promise.all([
      this.adapter.listInboxesSummary(),
      this.getStatusCounts(),
      this.getReceivedAndSentCounts(periodStart),
    ]);

    const avgFirstResponseMinutes = await this.getAvgFirstResponseMinutes(periodStart);

    return {
      unreadByInbox: inboxesSummary,
      totalUnread: inboxesSummary.reduce((sum, i) => sum + i.unread, 0),
      byStatus: statusCounts,
      ...received,
      avgFirstResponseMinutes,
    };
  }

  private async getStatusCounts(): Promise<Record<ThreadStatus, number>> {
    const rows = await this.threadStates
      .createQueryBuilder('state')
      .select('state.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('state.status')
      .getRawMany<{ status: ThreadStatus; count: string }>();

    const counts = Object.fromEntries(
      (Object.values(ThreadStatus) as ThreadStatus[]).map((status) => [status, 0]),
    ) as Record<ThreadStatus, number>;
    for (const row of rows) counts[row.status] = Number(row.count);
    return counts;
  }

  /**
   * Cuenta sobre hasta 100 threads más recientes por bandeja (el límite máximo por página que
   * permite Resend) - de sobra para el volumen actual de esta cuenta. Si el volumen crece más
   * allá de eso dentro del período consultado, esto empieza a subcontar - requeriría paginar de
   * verdad contra la API en ese momento (ver EMAIL_CRM.md).
   *
   * Pide `inbox` y `sent` juntos en una sola llamada por bandeja (Resend acepta `folders` como
   * array) y separa el resultado en memoria por `thread.folder` - la mitad de las llamadas a
   * Resend que pedirlos por separado (3 en vez de 6), importante porque la cuenta tiene un límite
   * real de 10 req/seg compartido con todo lo demás (ver `ResendInboxAdapter`/EMAIL_CRM.md).
   */
  private async getReceivedAndSentCounts(periodStart: Date | null) {
    const inboxes = Object.values(InboxAddress) as InboxAddress[];
    const perInbox = await Promise.all(
      inboxes.map(async (inbox) => {
        const { data } = await this.adapter.listThreads(inbox, {
          folders: ['inbox', 'sent'],
          limit: 100,
        });
        const inPeriod = data.filter((t) => !periodStart || new Date(t.received_at) >= periodStart);
        return {
          received: inPeriod.filter((t) => t.folder === 'inbox').length,
          sent: inPeriod.filter((t) => t.folder === 'sent').length,
        };
      }),
    );
    const receivedByInbox = perInbox.map((r) => r.received);
    const sentByInbox = perInbox.map((r) => r.sent);

    return {
      received: receivedByInbox.reduce((a, b) => a + b, 0),
      sent: sentByInbox.reduce((a, b) => a + b, 0),
    };
  }

  private async getAvgFirstResponseMinutes(periodStart: Date | null): Promise<number | null> {
    const qb = this.threadStates
      .createQueryBuilder('state')
      .where('state.firstReceivedAt IS NOT NULL')
      .andWhere('state.firstRespondedAt IS NOT NULL');
    if (periodStart) qb.andWhere('state.firstReceivedAt >= :periodStart', { periodStart });

    const rows = await qb.getMany();
    if (rows.length === 0) return null;

    const totalMinutes = rows.reduce((sum, row) => {
      const diffMs = row.firstRespondedAt!.getTime() - row.firstReceivedAt!.getTime();
      return sum + diffMs / 60_000;
    }, 0);
    return Math.round(totalMinutes / rows.length);
  }

  // ---------------------------------------------------------------------------------------

  private async audit(actor: AdminActor, action: string, threadId: string | null, detail: string | null) {
    await this.auditLogs.save(
      this.auditLogs.create({
        adminId: actor.id,
        adminEmail: actor.email,
        action,
        resendThreadId: threadId,
        detail,
      }),
    );
  }
}
