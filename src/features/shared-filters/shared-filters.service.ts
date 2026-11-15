import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'node:crypto';

import { IsNull, LessThan, Repository } from 'typeorm';

import { isUniqueViolation } from '../notifications/helpers/db-error.helper';
import { CreateSharedFilterDto } from './dto/create-shared-filter.dto';
import { SharedFilter, type SharedFiltersPayload } from './entities/shared-filter.entity';

/** Sin caracteres que se confunden al leerlos o dictarlos (0/O, 1/l/I). 56^6 ≈ 30 mil millones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const SHARED_FILTER_CODE_LENGTH = 6;
/** Formato aceptado al buscar: evita consultar la base con cualquier cosa. */
const CODE_PATTERN = /^[A-Za-z0-9]{4,12}$/;
/** Links que nadie abrió en este tiempo se borran (se purgan al crear uno nuevo). */
export const SHARED_FILTER_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export function generateSharedFilterCode(): string {
  let code = '';
  for (let index = 0; index < SHARED_FILTER_CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Misma forma para los mismos filtros (orden fijo de claves, estilos ordenados y sin repetir,
 *  textos sin espacios de más): así el hash identifica la combinación, no cómo vino escrita. */
export function normalizeSharedFilters(dto: CreateSharedFilterDto): SharedFiltersPayload {
  return {
    term: dto.term.trim(),
    category: dto.category,
    brand: dto.brand.trim() || 'todas',
    gender: dto.gender,
    sort: dto.sort,
    styles: Array.from(new Set(dto.styles)).sort(),
    capacityMl: dto.capacityMl ?? null,
  };
}

/**
 * Links cortos para compartir filtros del catálogo: `/productos?c=k7Qx2m` en vez de
 * `/productos?categoria=...&marca=...&genero=...&estilos=...`.
 */
@Injectable()
export class SharedFiltersService {
  constructor(
    @InjectRepository(SharedFilter)
    private readonly sharedFiltersRepository: Repository<SharedFilter>,
  ) {}

  /** El código de estos filtros: el que ya existía para la misma combinación, o uno nuevo. */
  async create(dto: CreateSharedFilterDto): Promise<{ code: string }> {
    const filters = normalizeSharedFilters(dto);
    const filtersHash = createHash('sha256').update(JSON.stringify(filters)).digest('hex');

    const existing = await this.sharedFiltersRepository.findOne({ where: { filtersHash } });
    if (existing) return { code: existing.code };

    await this.purgeUnused();
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateSharedFilterCode();
      try {
        await this.sharedFiltersRepository.insert({ code, filtersHash, filters, createdAt: new Date(), lastUsedAt: null });
        return { code };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Otro pedido guardó los mismos filtros al mismo tiempo, o (rarísimo) el código ya
        // existía: si es lo primero se devuelve ese; si no, se prueba otro código.
        const sameFilters = await this.sharedFiltersRepository.findOne({ where: { filtersHash } });
        if (sameFilters) return { code: sameFilters.code };
      }
    }
    throw new ServiceUnavailableException('No se pudo generar el link para compartir. Probá de nuevo.');
  }

  /** Los filtros de un código. 404 si no existe (o se borró por no usarse). */
  async findByCode(code: string): Promise<SharedFiltersPayload> {
    const link = CODE_PATTERN.test(code)
      ? await this.sharedFiltersRepository.findOne({ where: { code } })
      : null;
    if (!link) throw new NotFoundException('Este link compartido ya no está disponible.');

    await this.sharedFiltersRepository.update({ code }, { lastUsedAt: new Date() });
    return link.filters;
  }

  /** Borra los links que nadie abrió en los últimos `SHARED_FILTER_RETENTION_MS` (los nunca
   *  abiertos cuentan desde que se crearon). */
  private async purgeUnused(): Promise<void> {
    const threshold = new Date(Date.now() - SHARED_FILTER_RETENTION_MS);
    await this.sharedFiltersRepository.delete({ lastUsedAt: LessThan(threshold) });
    await this.sharedFiltersRepository.delete({ lastUsedAt: IsNull(), createdAt: LessThan(threshold) });
  }
}
