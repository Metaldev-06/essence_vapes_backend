import { formatPrice } from '../../products/helpers/format-price.helper';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';

const toOrderItemResponse = (item: OrderItem) => ({
  productId: item.productId,
  variantId: item.variantId,
  productName: item.productName,
  variantLabel: item.variantLabel ?? null,
  unitPriceValue: item.unitPriceValue,
  unitPrice: formatPrice(item.unitPriceValue),
  quantity: item.quantity,
  lineTotalValue: item.lineTotalValue,
  lineTotal: formatPrice(item.lineTotalValue),
});

export const toOrderResponse = (order: Order, items: OrderItem[]) => ({
  id: order.id,
  status: order.status,
  paymentStatus: order.paymentStatus,
  subtotalValue: order.subtotalValue,
  subtotal: formatPrice(order.subtotalValue),
  totalValue: order.totalValue,
  total: formatPrice(order.totalValue),
  currency: order.currency,
  buyerName: order.buyerName,
  buyerEmail: order.buyerEmail,
  buyerPhone: order.buyerPhone ?? undefined,
  shippingAddress: order.shippingAddress,
  expiresAt: order.expiresAt ?? undefined,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  items: items.map(toOrderItemResponse),
});

export type OrderResponse = ReturnType<typeof toOrderResponse>;
