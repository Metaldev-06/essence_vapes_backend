import { Product } from '../entities/product.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import type { MediaAsset } from '../interfaces/media-asset.interface';
import {
  BASE_VARIANT_ID,
  effectiveVariantImages,
  toProductCardResponse,
  toProductResponse,
} from './product-response.mapper';

const image = (publicId: string): MediaAsset =>
  ({ publicId, url: `https://res.cloudinary.com/demo/${publicId}.jpg` }) as MediaAsset;

const PRODUCT_IMAGES = [image('producto/frente'), image('producto/perfil')];

function makeProduct(): Product {
  return Object.assign(new Product(), {
    id: 'p1',
    brand: 'Jean Paul Gaultier',
    name: 'Le Male Elixir',
    priceValue: 21000,
    stock: 0,
    featured: false,
    variantLabel: '125ml',
    images: PRODUCT_IMAGES,
  });
}

function makeVariant(images: MediaAsset[] | null): ProductVariant {
  return Object.assign(new ProductVariant(), {
    id: 'v200',
    productId: 'p1',
    label: '200ml',
    priceValue: 50000,
    stock: 1,
    featured: false,
    sortOrder: 0,
    images,
  });
}

describe('imágenes de una variante', () => {
  it('sin imágenes propias usa las del producto', () => {
    expect(effectiveVariantImages(makeProduct(), makeVariant(null))).toEqual(PRODUCT_IMAGES);
  });

  it('una lista vacía también hereda (variante a la que se le borraron todas)', () => {
    expect(effectiveVariantImages(makeProduct(), makeVariant([]))).toEqual(PRODUCT_IMAGES);
  });

  it('con imágenes propias usa solo esas', () => {
    const own = [image('variante/200ml')];
    expect(effectiveVariantImages(makeProduct(), makeVariant(own))).toEqual(own);
  });
});

describe('card del catálogo (toProductCardResponse)', () => {
  it('la card de una variante sin imágenes propias muestra las del producto', () => {
    const card = toProductCardResponse(makeProduct(), makeVariant(null));

    expect(card.variantId).toBe('v200');
    expect(card.images).toEqual(PRODUCT_IMAGES);
  });

  it('la card de una variante con imágenes propias muestra las suyas', () => {
    const own = [image('variante/200ml')];
    expect(toProductCardResponse(makeProduct(), makeVariant(own)).images).toEqual(own);
  });

  it('la card base sigue mostrando las del producto', () => {
    expect(toProductCardResponse(makeProduct()).images).toEqual(PRODUCT_IMAGES);
  });

  it('coincide con lo que muestra la vista del producto para la misma variante', () => {
    const variant = makeVariant(null);
    const summary = toProductResponse(makeProduct(), [variant]).variants.find(
      (candidate) => candidate.id === 'v200',
    );

    expect(toProductCardResponse(makeProduct(), variant).images).toEqual(summary?.images);
  });
});

describe('inheritsImages en las variantes de la respuesta', () => {
  it('marca qué variantes usan las imágenes del producto', () => {
    const variants = toProductResponse(makeProduct(), [
      makeVariant(null),
      Object.assign(makeVariant([image('variante/10ml')]), { id: 'v10', sortOrder: 1 }),
    ]).variants;

    expect(variants.map((variant) => [variant.id, variant.inheritsImages])).toEqual([
      [BASE_VARIANT_ID, false],
      ['v200', true],
      ['v10', false],
    ]);
  });
});
