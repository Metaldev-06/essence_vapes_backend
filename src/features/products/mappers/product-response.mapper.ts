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
  featured: boolean;
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
  featured: variant.featured,
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
    featured: product.featured,
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
  countryOfOrigin: product.countryOfOrigin ?? undefined,
  concentration: product.concentration ?? undefined,
  netContentMl: product.netContentMl ?? undefined,
  manufacturerOrImporter: product.manufacturerOrImporter ?? undefined,
  sanitaryRegistrationNumber: product.sanitaryRegistrationNumber ?? undefined,
  decantSourceDescription: product.decantSourceDescription ?? undefined,
  decantVolumeMl: product.decantVolumeMl ?? undefined,
  batchNumber: product.batchNumber ?? undefined,
  sourceProductId: product.sourceProductId ?? undefined,
  saleAuthorizationStatus: product.saleAuthorizationStatus,
  saleAuthorizationCode: product.saleAuthorizationCode ?? undefined,
  saleAuthorizationValidFrom: product.saleAuthorizationValidFrom ?? undefined,
  saleAuthorizationValidUntil: product.saleAuthorizationValidUntil ?? undefined,
  requiresAgeVerification: product.requiresAgeVerification,
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
    featured: chosen.featured,
    oldPrice: chosen.id === BASE_VARIANT_ID ? base.oldPrice : undefined,
    oldPriceValue:
      chosen.id === BASE_VARIANT_ID ? base.oldPriceValue : undefined,
  };
};

/**
 * Minimal response for grid/card contexts (home "Más deseados", any future lightweight listing) -
 * omits the full fragrance/regulatory profile (accords, fragranceNotes, mood, season/day usage,
 * occasions, rating, regulatory/decant fields, etc.) and the nested `variants[]` (a card never
 * shows a size-switcher, only the one row it already is) since `ProductCard`/the cart never read
 * any of that. Still shape-compatible with `ProductResponse` - fields the frontend `Product` type
 * requires but this context has no use for (`subtitle`/`notes`/`styles`/`videos`/`variants`) get a
 * cheap empty default rather than a parallel "summary" type, so every existing consumer of
 * `Product` keeps working unmodified.
 */
export const toProductCardResponse = (
  product: Product,
  variant?: ProductVariant,
) => ({
  id: product.id,
  brand: product.brand,
  name: product.name,
  subtitle: '',
  notes: [] as string[],
  price: formatPrice(variant?.priceValue ?? product.priceValue),
  priceValue: variant?.priceValue ?? product.priceValue,
  oldPrice:
    !variant && product.oldPriceValue != null
      ? formatPrice(product.oldPriceValue)
      : undefined,
  oldPriceValue: !variant ? product.oldPriceValue ?? undefined : undefined,
  accent: product.accent,
  category: product.category,
  styles: [] as string[],
  featured: variant ? variant.featured : product.featured,
  gender: product.gender ?? undefined,
  images: (variant ? variant.images : product.images) ?? [],
  videos: [] as MediaAsset[],
  stock: variant?.stock ?? product.stock,
  isActive: product.isActive,
  saleAuthorizationStatus: product.saleAuthorizationStatus,
  requiresAgeVerification: product.requiresAgeVerification,
  variantId: variant?.id ?? BASE_VARIANT_ID,
  variantLabel: variant?.label ?? product.variantLabel ?? null,
  variants: [] as VariantSummary[],
});

export type ProductCardResponse = ReturnType<typeof toProductCardResponse>;

/**
 * SOLO para rutas admin autenticadas (`GET /products/admin/:id`) - nunca para `GET /products/:id`
 * (público, lo usa también el storefront). Agrega el costo de adquisición de cada variante
 * (ver tarea, punto 4.3 "rentabilidad") - un dato sensible de negocio que jamás debe viajar en la
 * respuesta pública, a diferencia del resto del producto que sí es información de catálogo.
 */
export const toAdminProductResponse = (product: Product, variants: ProductVariant[] = []) => {
  const base = toProductResponse(product, variants);
  const costByVariantId = new Map<string, number | null>([
    [BASE_VARIANT_ID, product.costValue ?? null],
    ...variants.map((variant): [string, number | null] => [variant.id, variant.costValue ?? null]),
  ]);
  return {
    ...base,
    costValue: product.costValue ?? null,
    variants: base.variants.map((variant) => ({
      ...variant,
      costValue: costByVariantId.get(variant.id) ?? null,
    })),
  };
};

export type AdminProductResponse = ReturnType<typeof toAdminProductResponse>;
