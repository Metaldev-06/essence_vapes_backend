import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';
import { flattenProductVariant } from '../../products/mappers/product-response.mapper';
import { CartItem } from '../entities/cart-item.entity';

/**
 * Every cart read goes through here, so `isValid`/`availableStock` always reflect the selected
 * variant's CURRENT stock, never a value cached at the time the item was added - that's what
 * makes cart stock checks "real-time" without any extra round-trip from the caller.
 */
export const toCartItemResponse = (
  item: CartItem,
  product: Product | undefined,
  variants: ProductVariant[] = [],
) => {
  const isActive = Boolean(product?.isActive);
  const flattened = product
    ? flattenProductVariant(product, variants, item.variantId)
    : null;
  const availableStock = isActive && flattened ? flattened.stock : 0;

  return {
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    product: isActive && flattened ? flattened : null,
    availableStock,
    isValid: isActive && availableStock >= item.quantity,
  };
};

export type CartItemResponse = ReturnType<typeof toCartItemResponse>;
