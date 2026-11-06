import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { MoreThan, Repository } from 'typeorm';

import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
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

@Injectable()
export class WithdrawalRequestsService {
  constructor(
    @InjectRepository(WithdrawalRequest)
    private readonly repository: Repository<WithdrawalRequest>,
    private readonly paginationService: PaginationService,
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
    const result = await this.paginationService.paginate(this.repository, {
      limit,
      offset,
      order,
      sort: sort as keyof WithdrawalRequest,
      where: status ? { status } : undefined,
    });
    return { ...result, data: result.data.map(toWithdrawalResponse) };
  }

  async updateStatus(id: string, dto: UpdateWithdrawalStatusDto) {
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`No se encontró la solicitud con id "${id}"`);
    }

    entity.status = dto.status;
    if (dto.adminNotes !== undefined) entity.adminNotes = dto.adminNotes;
    if (dto.status === WithdrawalStatus.CONFIRMADO || dto.status === WithdrawalStatus.RECHAZADO) {
      entity.resolvedAt = new Date();
    }

    const saved = await this.repository.save(entity);
    return toWithdrawalResponse(saved);
  }

  private async generateUniqueTrackingCode(): Promise<string> {
    let candidate = generateTrackingCode();
    while (await this.repository.exists({ where: { trackingCode: candidate } })) {
      candidate = generateTrackingCode();
    }
    return candidate;
  }
}
