import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { Product } from '../products/entities/product.entity';
import { toProductResponse } from '../products/mappers/product-response.mapper';
import { Favorite } from './entities/favorite.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoritesRepository: Repository<Favorite>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  /** Favorited products for a user, most recently favorited first. */
  async list(userId: string) {
    const favorites = await this.favoritesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (favorites.length === 0) return [];

    const ids = favorites.map((favorite) => favorite.productId);
    const products = await this.productsRepository.find({
      where: { id: In(ids), isActive: true },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    // Re-apply the favorites order; a product removed/deactivated since being
    // favorited is silently dropped rather than surfaced as a broken card.
    return ids
      .map((id) => productById.get(id))
      .filter((product): product is Product => Boolean(product))
      .map(toProductResponse);
  }

  async add(userId: string, productId: string) {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(
        `No se encontró el producto con id "${productId}"`,
      );
    }

    const exists = await this.favoritesRepository.exists({
      where: { userId, productId },
    });
    if (!exists) {
      await this.favoritesRepository.save(
        this.favoritesRepository.create({ userId, productId }),
      );
    }

    return toProductResponse(product);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.favoritesRepository.delete({ userId, productId });
  }
}
