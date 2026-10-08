import { Product } from '../../products/entities/product.entity';
import { toProductResponse } from '../../products/mappers/product-response.mapper';
import { CartItem } from '../entities/cart-item.entity';

/**
 * Every cart read goes through here, so `isValid`/`availableStock` always reflect the product's
 * CURRENT stock, never a value cached at the time the item was added - that's what makes cart
 * stock checks "real-time" without any extra round-trip from the caller.
 */
export const toCartItemResponse = (
  item: CartItem,
  product: Product | undefined,
) => {
  const isActive = Boolean(product?.isActive);
  const availableStock = isActive && product ? product.stock : 0;

  return {
    productId: item.productId,
    quantity: item.quantity,
    product: isActive && product ? toProductResponse(product) : null,
    availableStock,
    isValid: isActive && availableStock >= item.quantity,
  };
};

export type CartItemResponse = ReturnType<typeof toCartItemResponse>;
