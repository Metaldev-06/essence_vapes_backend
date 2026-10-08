import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { Product } from '../products/entities/product.entity';
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
  ): Promise<CartItemResponse> {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException(
        `No se encontró el producto con id "${productId}"`,
      );
    }
    if (product.stock < quantity) {
      throw new BadRequestException(
        product.stock === 0
          ? 'Este producto no tiene stock disponible'
          : `Solo quedan ${product.stock} unidades disponibles de este producto`,
      );
    }

    let item = await this.cartRepository.findOne({
      where: { userId, productId },
    });
    if (item) {
      item.quantity = quantity;
    } else {
      item = this.cartRepository.create({ userId, productId, quantity });
    }
    await this.cartRepository.save(item);

    return toCartItemResponse(item, product);
  }

  async removeItem(userId: string, productId: string): Promise<void> {
    await this.cartRepository.delete({ userId, productId });
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
      await this.cartRepository.delete({
        userId,
        productId: In(removed.map((item) => item.productId)),
      });
    }

    return { items: withStock.filter((item) => item.isValid), removed };
  }

  private async withLiveStock(items: CartItem[]): Promise<CartItemResponse[]> {
    if (items.length === 0) return [];
    const ids = items.map((item) => item.productId);
    const products = await this.productsRepository.find({
      where: { id: In(ids) },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    return items.map((item) =>
      toCartItemResponse(item, productById.get(item.productId)),
    );
  }
}
