import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { BASE_VARIANT_ID } from '../products/mappers/product-response.mapper';
import { CartItem } from './entities/cart-item.entity';
import {
  CartItemResponse,
  toCartItemResponse,
} from './mappers/cart-item-response.mapper';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepository: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly productVariantsRepository: Repository<ProductVariant>,
  ) {}

  async getCart(userId: string): Promise<CartItemResponse[]> {
    const items = await this.cartRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return this.withLiveStock(items);
  }

  /** Upserts a line to an absolute quantity, rejecting anything the current stock can't cover. */
  async setItem(
    userId: string,
    productId: string,
    quantity: number,
    variantId: string = BASE_VARIANT_ID,
  ): Promise<CartItemResponse> {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException(
        `No se encontró el producto con id "${productId}"`,
      );
    }

    const stock = await this.resolveVariantStock(productId, variantId);
    if (stock === null) {
      throw new NotFoundException(
        `No se encontró la variante "${variantId}" de este producto`,
      );
    }
    if (stock < quantity) {
      throw new BadRequestException(
        stock === 0
          ? 'Este producto no tiene stock disponible'
          : `Solo quedan ${stock} unidades disponibles de este producto`,
      );
    }

    let item = await this.cartRepository.findOne({
      where: { userId, productId, variantId },
    });
    if (item) {
      item.quantity = quantity;
    } else {
      item = this.cartRepository.create({ userId, productId, variantId, quantity });
    }
    await this.cartRepository.save(item);

    const variants = await this.loadVariantsFor([productId]);
    return toCartItemResponse(item, product, variants.get(productId) ?? []);
  }

  async removeItem(
    userId: string,
    productId: string,
    variantId: string = BASE_VARIANT_ID,
  ): Promise<void> {
    await this.cartRepository.delete({ userId, productId, variantId });
  }

  async clear(userId: string): Promise<void> {
    await this.cartRepository.delete({ userId });
  }

  /**
   * The gate before checkout: re-checks every line against current stock and, unlike `getCart`,
   * actually deletes (server-side) whatever no longer fits instead of just flagging it.
   */
  async validate(
    userId: string,
  ): Promise<{ items: CartItemResponse[]; removed: CartItemResponse[] }> {
    const items = await this.cartRepository.find({ where: { userId } });
    const withStock = await this.withLiveStock(items);

    const removed = withStock.filter((item) => !item.isValid);
    if (removed.length > 0) {
      await Promise.all(
        removed.map((item) =>
          this.cartRepository.delete({
            userId,
            productId: item.productId,
            variantId: item.variantId,
          }),
        ),
      );
    }

    return { items: withStock.filter((item) => item.isValid), removed };
  }

  private async resolveVariantStock(
    productId: string,
    variantId: string,
  ): Promise<number | null> {
    if (variantId === BASE_VARIANT_ID) {
      const product = await this.productsRepository.findOne({
        where: { id: productId },
        select: { stock: true },
      });
      return product?.stock ?? null;
    }

    const variant = await this.productVariantsRepository.findOne({
      where: { id: variantId, productId },
    });
    return variant?.stock ?? null;
  }

  private async withLiveStock(items: CartItem[]): Promise<CartItemResponse[]> {
    if (items.length === 0) return [];
    const ids = [...new Set(items.map((item) => item.productId))];
    const products = await this.productsRepository.find({
      where: { id: In(ids) },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const variantsByProductId = await this.loadVariantsFor(ids);

    return items.map((item) =>
      toCartItemResponse(
        item,
        productById.get(item.productId),
        variantsByProductId.get(item.productId) ?? [],
      ),
    );
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
