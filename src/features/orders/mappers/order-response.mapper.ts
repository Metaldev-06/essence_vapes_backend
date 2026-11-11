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
  deliveryMethod: order.deliveryMethod,
  shippingAddress: order.shippingAddress ?? undefined,
  pickupDetails: order.pickupDetails ?? undefined,
  logisticsStatus: order.logisticsStatus,
  logisticsCompletedAt: order.logisticsCompletedAt ?? undefined,
  shippingCostMode: order.shippingCostMode ?? undefined,
  shippingCostValue: order.shippingCostValue ?? undefined,
  // `null`/ausente = todavía no se conoce (envío "a coordinar" sin definir) - nunca mostrar como
  // si fuera $0. El frontend debe distinguir esto de un envío gratuito real (`shippingCostMode:
  // 'free'`).
  shippingCost: order.shippingCostValue != null ? formatPrice(order.shippingCostValue) : undefined,
  shippingCostPending: order.shippingCostValue == null && !order.pickupDetails,
  expiresAt: order.expiresAt ?? undefined,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  items: items.map(toOrderItemResponse),
});

export type OrderResponse = ReturnType<typeof toOrderResponse>;
