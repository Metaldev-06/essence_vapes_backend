import { Injectable } from '@nestjs/common';
import {
  Repository,
  FindOptionsOrder,
  ObjectLiteral,
  FindOptionsRelations,
} from 'typeorm';

interface PaginationOptions<T> {
  limit: number;
  offset: number;
  order: 'asc' | 'desc';
  sort: keyof T;
  where?: object;
  relations?: FindOptionsRelations<T>;
}

@Injectable()
export class PaginationService {
  async paginate<T extends ObjectLiteral>(
    repository: Repository<T>,
    options: PaginationOptions<T>,
  ) {
    const { limit, offset, order, sort, where, relations } = options;

    const orderBy: FindOptionsOrder<T> = {
      [sort]: order,
    } as FindOptionsOrder<T>;

    const [items, total] = await repository.findAndCount({
      take: limit,
      skip: offset,
      order: orderBy,
      where,
      relations,
    });

    const pages = Math.ceil(total / limit);
    const current = Math.floor(offset / limit) + 1;

    return {
      data: items,
      pagination: {
        total,
        pages,
        current,
        limit,
        offset,
      },
    };
  }
}
