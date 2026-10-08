import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { CloudinaryService } from '../../common/services/cloudinary/cloudinary.service';
import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import {
  MAX_IMAGES_PER_PRODUCT,
  MAX_VIDEOS_PER_PRODUCT,
} from './constants/media.constants';
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
    private readonly cloudinaryService: CloudinaryService,
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
    const product = await this.findEntityOrFail(id);
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
    const product = await this.findEntityOrFail(id);

    try {
      Object.assign(product, dto);
      const saved = await this.productsRepository.save(product);
      return toProductResponse(saved);
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.update');
    }
  }

  async remove(id: string): Promise<void> {
    const product = await this.findEntityOrFail(id);

    await Promise.all([
      ...(product.images ?? []).map((image) =>
        this.cloudinaryService.destroy(image.publicId, 'image'),
      ),
      ...(product.videos ?? []).map((video) =>
        this.cloudinaryService.destroy(video.publicId, 'video'),
      ),
    ]);

    await this.productsRepository.delete(id);
  }

  async addImages(id: string, files: Express.Multer.File[]) {
    const product = await this.findEntityOrFail(id);
    const currentImages = product.images ?? [];

    if (currentImages.length + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `Un producto puede tener como máximo ${MAX_IMAGES_PER_PRODUCT} imágenes`,
      );
    }

    const uploaded = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadImage(
          file,
          `essence-vapes/products/${product.id}`,
        ),
      ),
    );

    product.images = [...currentImages, ...uploaded];
    const saved = await this.productsRepository.save(product);
    return toProductResponse(saved);
  }

  async removeImage(id: string, publicId: string) {
    const product = await this.findEntityOrFail(id);
    const currentImages = product.images ?? [];

    if (!currentImages.some((image) => image.publicId === publicId)) {
      throw new NotFoundException(
        `No se encontró la imagen "${publicId}" en este producto`,
      );
    }

    await this.cloudinaryService.destroy(publicId, 'image');
    product.images = currentImages.filter(
      (image) => image.publicId !== publicId,
    );
    const saved = await this.productsRepository.save(product);
    return toProductResponse(saved);
  }

  async addVideos(id: string, files: Express.Multer.File[]) {
    const product = await this.findEntityOrFail(id);
    const currentVideos = product.videos ?? [];

    if (currentVideos.length + files.length > MAX_VIDEOS_PER_PRODUCT) {
      throw new BadRequestException(
        `Un producto puede tener como máximo ${MAX_VIDEOS_PER_PRODUCT} videos`,
      );
    }

    const uploaded = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadVideo(
          file,
          `essence-vapes/products/${product.id}`,
        ),
      ),
    );

    product.videos = [...currentVideos, ...uploaded];
    const saved = await this.productsRepository.save(product);
    return toProductResponse(saved);
  }

  async removeVideo(id: string, publicId: string) {
    const product = await this.findEntityOrFail(id);
    const currentVideos = product.videos ?? [];

    if (!currentVideos.some((video) => video.publicId === publicId)) {
      throw new NotFoundException(
        `No se encontró el video "${publicId}" en este producto`,
      );
    }

    await this.cloudinaryService.destroy(publicId, 'video');
    product.videos = currentVideos.filter(
      (video) => video.publicId !== publicId,
    );
    const saved = await this.productsRepository.save(product);
    return toProductResponse(saved);
  }

  private async findEntityOrFail(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product)
      throw new NotFoundException(`No se encontró el producto con id "${id}"`);
    return product;
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
