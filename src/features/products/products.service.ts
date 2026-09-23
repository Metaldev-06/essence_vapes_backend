import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import { PRODUCTS_SEED } from './data/products.seed';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsQueryDto } from './dto/products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { slugify } from './helpers/slugify.helper';
import { toProductResponse } from './mappers/product-response.mapper';

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.productsRepository.count();
    if (count === 0) {
      await this.productsRepository.save(PRODUCTS_SEED);
    }
  }

  async findAll(query: ProductsQueryDto) {
    const {
      limit = 12,
      offset = 0,
      order = 'asc',
      sort = 'createdAt',
      term,
      category,
      brand,
      gender,
      accent,
      styles,
      featured,
      minPrice,
      maxPrice,
    } = query;

    try {
      const qb = this.productsRepository
        .createQueryBuilder('product')
        .where('product.isActive = :isActive', { isActive: true });

      if (term) {
        qb.andWhere(
          '(LOWER(product.name) LIKE :term OR LOWER(product.brand) LIKE :term)',
          {
            term: `%${term.toLowerCase()}%`,
          },
        );
      }

      if (category) qb.andWhere('product.category = :category', { category });
      if (brand) qb.andWhere('LOWER(product.brand) = LOWER(:brand)', { brand });
      if (gender) qb.andWhere('product.gender = :gender', { gender });
      if (accent) qb.andWhere('product.accent = :accent', { accent });
      if (featured !== undefined)
        qb.andWhere('product.featured = :featured', { featured });
      if (minPrice !== undefined)
        qb.andWhere('product.priceValue >= :minPrice', { minPrice });
      if (maxPrice !== undefined)
        qb.andWhere('product.priceValue <= :maxPrice', { maxPrice });

      if (styles && styles.length > 0) {
        qb.andWhere(
          new Array(styles.length)
            .fill(null)
            .map((_, i) => `product.styles LIKE :style${i}`)
            .join(' OR '),
          Object.fromEntries(
            styles.map((style, i) => [`style${i}`, `%${style}%`]),
          ),
        );
      }

      qb.orderBy(`product.${sort}`, order.toUpperCase() as 'ASC' | 'DESC')
        .skip(offset)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();

      return {
        data: items.map(toProductResponse),
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: Math.floor(offset / limit) + 1,
          limit,
          offset,
        },
      };
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.findAll');
    }
  }

  async findFeatured() {
    const items = await this.productsRepository.find({
      where: { isActive: true, featured: true },
      order: { createdAt: 'DESC' },
    });
    return items.map(toProductResponse);
  }

  async findOne(id: string) {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product)
      throw new NotFoundException(`Product with id "${id}" not found`);
    return toProductResponse(product);
  }

  async create(dto: CreateProductDto) {
    try {
      const id = dto.id
        ? slugify(dto.id)
        : await this.generateUniqueSlug(`${dto.brand}-${dto.name}`);
      const product = this.productsRepository.create({ ...dto, id });
      const saved = await this.productsRepository.save(product);
      return toProductResponse(saved);
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.create');
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product)
      throw new NotFoundException(`Product with id "${id}" not found`);

    try {
      Object.assign(product, dto);
      const saved = await this.productsRepository.save(product);
      return toProductResponse(saved);
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.update');
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.productsRepository.delete(id);
    if (result.affected === 0)
      throw new NotFoundException(`Product with id "${id}" not found`);
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    const baseSlug = slugify(base);
    let candidate = baseSlug;
    let suffix = 2;

    while (await this.productsRepository.exists({ where: { id: candidate } })) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}
