import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import { Address } from './entities/address.entity';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

/** Tope por cuenta - no hay ningún caso de uso legítimo para más, y evita que una cuenta
 *  comprometida o un bug de UI llene la tabla sin límite. */
const MAX_ADDRESSES_PER_USER = 20;

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** La default (si hay alguna) siempre primero. */
  list(userId: string): Promise<Address[]> {
    return this.addressesRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const count = await this.addressesRepository.count({ where: { userId } });
    if (count >= MAX_ADDRESSES_PER_USER) {
      throw new BadRequestException(
        `Podés guardar hasta ${MAX_ADDRESSES_PER_USER} direcciones. Eliminá alguna para agregar otra.`,
      );
    }

    // La primera dirección de una cuenta siempre es default, aunque no se haya pedido
    // explícitamente - nunca debe quedar una cuenta con direcciones pero ninguna marcada.
    const makeDefault = dto.isDefault === true || count === 0;

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Address);
      if (makeDefault) await repo.update({ userId }, { isDefault: false });

      return repo.save(
        repo.create({
          ...dto,
          userId,
          apartment: dto.apartment ?? null,
          betweenStreets: dto.betweenStreets ?? null,
          notes: dto.notes ?? null,
          isDefault: makeDefault,
        }),
      );
    });
  }

  async update(userId: string, id: string, dto: UpdateAddressDto): Promise<Address> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Address);
      const address = await repo.findOne({ where: { id, userId } });
      if (!address) throw new NotFoundException('No se encontró la dirección');

      if (dto.isDefault === true) await repo.update({ userId }, { isDefault: false });

      Object.assign(address, dto);
      return repo.save(address);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Address);
      const address = await repo.findOne({ where: { id, userId } });
      if (!address) throw new NotFoundException('No se encontró la dirección');

      await repo.delete({ id });

      // Si se borró la default y quedan otras, promover la más reciente - nunca dejar
      // direcciones guardadas sin ninguna marcada como default.
      if (address.isDefault) {
        const next = await repo.findOne({ where: { userId }, order: { createdAt: 'DESC' } });
        if (next) await repo.update({ id: next.id }, { isDefault: true });
      }
    });
  }
}
