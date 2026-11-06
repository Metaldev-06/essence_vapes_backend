import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import {
  BASE_VARIANT_ID,
  flattenProductVariant,
  ProductResponse,
} from '../products/mappers/product-response.mapper';
import { Favorite } from './entities/favorite.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoritesRepository: Repository<Favorite>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly productVariantsRepository: Repository<ProductVariant>,
  ) {}

  /** Favorited product variants for a user, most recently favorited first. */
  async list(userId: string): Promise<ProductResponse[]> {
    const favorites = await this.favoritesRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (favorites.length === 0) return [];

    const productIds = [...new Set(favorites.map((favorite) => favorite.productId))];
    const products = await this.productsRepository.find({
      where: { id: In(productIds), isActive: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const variantsByProductId = await this.loadVariantsFor(productIds);

    // Re-apply the favorites order; a product removed/deactivated since being
    // favorited is silently dropped rather than surfaced as a broken card.
    return favorites
      .map((favorite) => {
        const product = productById.get(favorite.productId);
        if (!product) return null;
        return flattenProductVariant(
          product,
          variantsByProductId.get(product.id) ?? [],
          favorite.variantId,
        );
      })
      .filter((row): row is ProductResponse => row !== null);
  }

  async add(
    userId: string,
    productId: string,
    variantId: string = BASE_VARIANT_ID,
  ): Promise<ProductResponse> {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(
        `No se encontró el producto con id "${productId}"`,
      );
    }

    const variants = await this.productVariantsRepository.find({
      where: { productId },
    });
    if (variantId !== BASE_VARIANT_ID && !variants.some((variant) => variant.id === variantId)) {
      throw new NotFoundException(
        `No se encontró la variante "${variantId}" de este producto`,
      );
    }

    const exists = await this.favoritesRepository.exists({
      where: { userId, productId, variantId },
    });
    if (!exists) {
      await this.favoritesRepository.save(
        this.favoritesRepository.create({ userId, productId, variantId }),
      );
    }

    return flattenProductVariant(product, variants, variantId);
  }

  async remove(
    userId: string,
    productId: string,
    variantId: string = BASE_VARIANT_ID,
  ): Promise<void> {
    await this.favoritesRepository.delete({ userId, productId, variantId });
  }

  private async loadVariantsFor(
    productIds: string[],
  ): Promise<Map<string, ProductVariant[]>> {
    const map = new Map<string, ProductVariant[]>();
    if (productIds.length === 0) return map;

    const variants = await this.productVariantsRepository.find({
      where: { productId: In(productIds) },
    });
    for (const variant of variants) {
      const list = map.get(variant.productId) ?? [];
      list.push(variant);
      map.set(variant.productId, list);
    }
    return map;
  }
}
