import { formatPrice } from '../helpers/format-price.helper';
import { Product } from '../entities/product.entity';

export const toProductResponse = (product: Product) => ({
  id: product.id,
  brand: product.brand,
  name: product.name,
  subtitle: product.subtitle,
  notes: product.notes ?? [],
  price: formatPrice(product.priceValue),
  priceValue: product.priceValue,
  oldPrice:
    product.oldPriceValue != null
      ? formatPrice(product.oldPriceValue)
      : undefined,
  badge: product.badge ?? undefined,
  accent: product.accent,
  category: product.category,
  styles: product.styles ?? [],
  featured: product.featured,
  year: product.year ?? undefined,
  origin: product.origin ?? undefined,
  gender: product.gender ?? undefined,
  rating: product.rating ?? undefined,
  ratingCount: product.ratingCount ?? undefined,
  accords: product.accords ?? undefined,
  fragranceNotes: product.fragranceNotes ?? undefined,
  mood: product.mood ?? undefined,
  seasonUsage: product.seasonUsage ?? undefined,
  dayUsage: product.dayUsage ?? undefined,
  occasions: product.occasions ?? undefined,
  sillage: product.sillage ?? undefined,
  longevity: product.longevity ?? undefined,
  stock: product.stock,
  isActive: product.isActive,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

export type ProductResponse = ReturnType<typeof toProductResponse>;
