import { formatPrice } from '../helpers/format-price.helper';
import { Product } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import type { MediaAsset } from '../interfaces/media-asset.interface';

export const BASE_VARIANT_ID = 'base';

export interface VariantSummary {
  id: string;
  label: string | null;
  priceValue: number;
  price: string;
  stock: number;
  images: MediaAsset[];
}

const toVariantSummary = (
  product: Product,
  variant: ProductVariant,
): VariantSummary => ({
  id: variant.id,
  label: variant.label,
  priceValue: variant.priceValue,
  price: formatPrice(variant.priceValue),
  stock: variant.stock,
  images: variant.images ?? product.images ?? [],
});

/** The variant array always starts with the "base" one (the product's own price/stock/images). */
const buildVariants = (
  product: Product,
  variants: ProductVariant[],
): VariantSummary[] => [
  {
    id: BASE_VARIANT_ID,
    label: product.variantLabel ?? null,
    priceValue: product.priceValue,
    price: formatPrice(product.priceValue),
    stock: product.stock,
    images: product.images ?? [],
  },
  ...variants
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((variant) => toVariantSummary(product, variant)),
];

export const toProductResponse = (
  product: Product,
  variants: ProductVariant[] = [],
) => ({
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
  // Raw number alongside the formatted display string above - the admin form needs this to
  // populate an editable field; the storefront only ever reads `oldPrice`.
  oldPriceValue: product.oldPriceValue ?? undefined,
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
  images: product.images ?? [],
  videos: product.videos ?? [],
  stock: product.stock,
  isActive: product.isActive,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
  // Variant-selection fields - on this base response they always describe the "base" variant
  // (the product's own fields). `flattenProductVariant` overrides these for a specific variant.
  variantId: BASE_VARIANT_ID,
  variantLabel: product.variantLabel ?? null,
  variants: buildVariants(product, variants),
});

export type ProductResponse = ReturnType<typeof toProductResponse>;

/**
 * Same product, but with every variant-dependent field (price/stock/images/...) overridden to
 * reflect one specific variant - `id` stays the real product id (routing/favorites/cart all key
 * off it), only `variantId` identifies which one was selected. Falls back to the base variant if
 * `variantId` doesn't match any of this product's variants.
 */
export const flattenProductVariant = (
  product: Product,
  variants: ProductVariant[],
  variantId: string,
): ProductResponse => {
  const base = toProductResponse(product, variants);
  const chosen =
    base.variants.find((variant) => variant.id === variantId) ??
    base.variants[0];

  return {
    ...base,
    variantId: chosen.id,
    variantLabel: chosen.label,
    priceValue: chosen.priceValue,
    price: chosen.price,
    stock: chosen.stock,
    images: chosen.images,
    oldPrice: chosen.id === BASE_VARIANT_ID ? base.oldPrice : undefined,
    oldPriceValue:
      chosen.id === BASE_VARIANT_ID ? base.oldPriceValue : undefined,
  };
};
