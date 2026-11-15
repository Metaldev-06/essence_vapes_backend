import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, Repository } from 'typeorm';

import { CreateSharedFilterDto } from './dto/create-shared-filter.dto';
import { SharedFilter } from './entities/shared-filter.entity';
import {
  SHARED_FILTER_CODE_LENGTH,
  SHARED_FILTER_RETENTION_MS,
  SharedFiltersService,
  generateSharedFilterCode,
} from './shared-filters.service';

// Los filtros de la captura del usuario.
const FILTERS: CreateSharedFilterDto = {
  term: '',
  category: 'perfumes',
  brand: 'Jean Paul Gaultier',
  gender: 'masculino',
  sort: 'destacados',
  styles: ['tropical', 'amaderado'],
  capacityMl: null,
};

/** Contra una base SQLite EN MEMORIA (nunca toca essence-vapes.sqlite). */
describe('SharedFiltersService', () => {
  let dataSource: DataSource;
  let repository: Repository<SharedFilter>;
  let service: SharedFiltersService;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [SharedFilter],
      synchronize: true,
    });
    await dataSource.initialize();
    repository = dataSource.getRepository(SharedFilter);
    service = new SharedFiltersService(repository);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it(`devuelve un código corto de ${SHARED_FILTER_CODE_LENGTH} caracteres`, async () => {
    const { code } = await service.create(FILTERS);

    expect(code).toMatch(new RegExp(`^[A-Za-z0-9]{${SHARED_FILTER_CODE_LENGTH}}$`));
  });

  it('el código devuelve exactamente los filtros compartidos', async () => {
    const { code } = await service.create(FILTERS);

    await expect(service.findByCode(code)).resolves.toEqual({
      ...FILTERS,
      styles: ['amaderado', 'tropical'],
    });
  });

  it('los mismos filtros dan siempre el mismo código, sin sumar filas', async () => {
    const first = await service.create(FILTERS);
    // Mismos filtros escritos distinto: estilos en otro orden, espacios de más.
    const second = await service.create({ ...FILTERS, styles: ['amaderado', 'tropical'], brand: ' Jean Paul Gaultier ' });

    expect(second.code).toBe(first.code);
    expect(await repository.count()).toBe(1);
  });

  it('filtros distintos dan códigos distintos', async () => {
    const first = await service.create(FILTERS);
    const second = await service.create({ ...FILTERS, gender: 'femenino' });

    expect(second.code).not.toBe(first.code);
  });

  it('un código inexistente o con formato inválido responde 404', async () => {
    await expect(service.findByCode('noExiste')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findByCode("x'; DROP TABLE--")).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borra los links que nadie abrió en mucho tiempo, pero no los que se usan', async () => {
    const old = Date.now() - SHARED_FILTER_RETENTION_MS - 60_000;
    await repository.insert({ code: 'viejo1', filtersHash: 'a'.repeat(64), filters: { ...FILTERS }, createdAt: new Date(old), lastUsedAt: null });
    await repository.insert({ code: 'usado1', filtersHash: 'b'.repeat(64), filters: { ...FILTERS }, createdAt: new Date(old), lastUsedAt: new Date() });

    await service.create({ ...FILTERS, gender: 'unisex' });

    const codes = (await repository.find()).map((link) => link.code);
    expect(codes).not.toContain('viejo1');
    expect(codes).toContain('usado1');
  });

  it('el generador usa solo caracteres que no se confunden (sin 0, O, 1, l, I)', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateSharedFilterCode()).not.toMatch(/[0O1lI]/);
    }
  });
});

describe('CreateSharedFilterDto', () => {
  const errorsFor = async (overrides: Record<string, unknown>) =>
    (await validate(plainToInstance(CreateSharedFilterDto, { ...FILTERS, ...overrides }))).map((error) => error.property);

  it('acepta los filtros de la captura', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('rechaza valores que el catálogo no ofrece', async () => {
    expect(await errorsFor({ category: 'armas' })).toEqual(['category']);
    expect(await errorsFor({ gender: 'robot' })).toEqual(['gender']);
    expect(await errorsFor({ sort: 'random' })).toEqual(['sort']);
    expect(await errorsFor({ styles: ['dulce', 'inventado'] })).toEqual(['styles']);
    expect(await errorsFor({ capacityMl: -5 })).toEqual(['capacityMl']);
  });

  it('acota los largos para que nadie guarde textos enormes', async () => {
    expect(await errorsFor({ brand: 'x'.repeat(81) })).toEqual(['brand']);
    expect(await errorsFor({ term: 'y'.repeat(81) })).toEqual(['term']);
    expect(await errorsFor({ styles: new Array(13).fill('dulce') })).toEqual(['styles']);
  });
});
