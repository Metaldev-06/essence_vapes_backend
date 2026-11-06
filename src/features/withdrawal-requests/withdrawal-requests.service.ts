import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MoreThan, Repository } from 'typeorm';

import { escapeHtml } from '../../common/helpers/escape-html.helper';
import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import { EmailService } from '../../common/services/email/email.service';
import { PaginationService } from '../../common/services/pagination/pagination.service';
import { CreateWithdrawalRequestDto } from './dto/create-withdrawal-request.dto';
import { LookupWithdrawalRequestDto } from './dto/lookup-withdrawal-request.dto';
import { QueryWithdrawalRequestsDto } from './dto/query-withdrawal-requests.dto';
import { UpdateWithdrawalStatusDto } from './dto/update-withdrawal-status.dto';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { WithdrawalStatus } from './enums/withdrawal-status.enum';
import { generateTrackingCode } from './helpers/tracking-code.helper';
import {
  toPublicWithdrawalResponse,
  toWithdrawalResponse,
} from './mappers/withdrawal-request-response.mapper';

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const STATUS_LABELS: Record<WithdrawalStatus, string> = {
  [WithdrawalStatus.RECIBIDO]: 'Recibida',
  [WithdrawalStatus.EN_REVISION]: 'En revisión',
  [WithdrawalStatus.CONFIRMADO]: 'Confirmada',
  [WithdrawalStatus.RECHAZADO]: 'Rechazada',
};

@Injectable()
export class WithdrawalRequestsService {
  constructor(
    @InjectRepository(WithdrawalRequest)
    private readonly repository: Repository<WithdrawalRequest>,
    private readonly paginationService: PaginationService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Crea un trámite de arrepentimiento. Si hay `orderReference`, rechaza un duplicado obvio
   * (mismo email + misma referencia, todavía sin resolver, en las últimas 24hs) para frenar
   * reenvíos por error del propio formulario sin bloquear reclamos legítimos distintos.
   */
  async create(dto: CreateWithdrawalRequestDto) {
    const email = dto.email.toLowerCase().trim();

    if (dto.orderReference) {
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
      const duplicate = await this.repository.findOne({
        where: { email, orderReference: dto.orderReference, createdAt: MoreThan(since) },
      });
      if (duplicate) {
        throw new BadRequestException(
          `Ya existe una solicitud para ese pedido (código ${duplicate.trackingCode}). ` +
            'Si necesitás agregar información, usá el canal de contacto citando ese código.',
        );
      }
    }

    try {
      const entity = this.repository.create({
        ...dto,
        email,
        trackingCode: await this.generateUniqueTrackingCode(),
      });
      const saved = await this.repository.save(entity);
      await this.notifyCreated(saved);
      return toWithdrawalResponse(saved);
    } catch (error) {
      HandleDBExceptions(error, 'WithdrawalRequestsService.create');
    }
  }

  /** Consulta pública de estado: exige el email exacto para no exponer trámites de terceros. */
  async lookup(dto: LookupWithdrawalRequestDto) {
    const entity = await this.repository.findOne({
      where: {
        trackingCode: dto.trackingCode.trim().toUpperCase(),
        email: dto.email.toLowerCase().trim(),
      },
    });
    if (!entity) {
      throw new NotFoundException(
        'No encontramos una solicitud con ese código de gestión y ese email',
      );
    }
    return toPublicWithdrawalResponse(entity);
  }

  async findAllForAdmin(query: QueryWithdrawalRequestsDto) {
    const { limit = 20, offset = 0, order = 'desc', sort = 'createdAt', status } = query;
    try {
      const result = await this.paginationService.paginate(this.repository, {
        limit,
        offset,
        order,
        sort: sort as keyof WithdrawalRequest,
        where: status ? { status } : undefined,
      });
      return { ...result, data: result.data.map(toWithdrawalResponse) };
    } catch (error) {
      HandleDBExceptions(error, 'WithdrawalRequestsService.findAllForAdmin');
    }
  }

  async updateStatus(id: string, dto: UpdateWithdrawalStatusDto) {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`No se encontró la solicitud con id "${id}"`);
    }

    const statusChanged = entity.status !== dto.status;
    entity.status = dto.status;
    if (dto.adminNotes !== undefined) entity.adminNotes = dto.adminNotes;
    if (dto.status === WithdrawalStatus.CONFIRMADO || dto.status === WithdrawalStatus.RECHAZADO) {
      entity.resolvedAt = new Date();
    }

    const saved = await this.repository.save(entity);
    if (statusChanged) await this.notifyStatusChanged(saved);
    return toWithdrawalResponse(saved);
  }

  private async generateUniqueTrackingCode(): Promise<string> {
    let candidate = generateTrackingCode();
    while (await this.repository.exists({ where: { trackingCode: candidate } })) {
      candidate = generateTrackingCode();
    }
    return candidate;
  }

  /** Confirmación al consumidor (dentro del plazo legal de 24hs) + alerta interna - ninguna de
   *  las dos debe poder tirar abajo la creación de la solicitud si Resend falla. */
  private async notifyCreated(entity: WithdrawalRequest): Promise<void> {
    const { sales, noReply, supportInbox } = this.emailService.addresses;

    await this.emailService.send({
      from: sales,
      to: entity.email,
      subject: `Recibimos tu solicitud de arrepentimiento - código ${entity.trackingCode}`,
      html: `
        <h2>¡Hola ${escapeHtml(entity.buyerName)}!</h2>
        <p>Recibimos tu solicitud de arrepentimiento. Guardá este código de gestión para
        consultar el estado cuando quieras:</p>
        <p style="font-size:20px;font-weight:700;letter-spacing:.04em">${entity.trackingCode}</p>
        <p><strong>Producto:</strong> ${escapeHtml(entity.productDescription)}</p>
        <p>Te vamos a avisar por este mismo medio cuando actualicemos el estado.</p>
        <p>Essence Vapes</p>
      `,
    });

    await this.emailService.send({
      from: noReply,
      to: supportInbox,
      replyTo: entity.email,
      subject: `Nueva solicitud de arrepentimiento - ${entity.trackingCode}`,
      html: `
        <h2>Nueva solicitud de arrepentimiento</h2>
        <p><strong>Código:</strong> ${entity.trackingCode}</p>
        <p><strong>Comprador:</strong> ${escapeHtml(entity.buyerName)} (${escapeHtml(entity.email)})</p>
        ${entity.phone ? `<p><strong>Teléfono:</strong> ${escapeHtml(entity.phone)}</p>` : ''}
        ${entity.orderReference ? `<p><strong>Referencia de pedido:</strong> ${escapeHtml(entity.orderReference)}</p>` : ''}
        <p><strong>Producto:</strong> ${escapeHtml(entity.productDescription)}</p>
        ${entity.comments ? `<p><strong>Comentarios:</strong> ${escapeHtml(entity.comments)}</p>` : ''}
        <p>Gestionalo desde el panel admin.</p>
      `,
    });
  }

  private async notifyStatusChanged(entity: WithdrawalRequest): Promise<void> {
    const { sales } = this.emailService.addresses;

    await this.emailService.send({
      from: sales,
      to: entity.email,
      subject: `Actualizamos tu solicitud ${entity.trackingCode} - ${STATUS_LABELS[entity.status]}`,
      html: `
        <h2>¡Hola ${escapeHtml(entity.buyerName)}!</h2>
        <p>El estado de tu solicitud <strong>${entity.trackingCode}</strong> cambió a:</p>
        <p style="font-size:18px;font-weight:700">${STATUS_LABELS[entity.status]}</p>
        ${entity.adminNotes ? `<p><strong>Comentario:</strong> ${escapeHtml(entity.adminNotes)}</p>` : ''}
        <p>Essence Vapes</p>
      `,
    });
  }
}
