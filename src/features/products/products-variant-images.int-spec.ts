import { NotFoundException } from '@nestjs/common';

import { ProductVariant } from './entities/product-variant.entity';
import type { MediaAsset } from './interfaces/media-asset.interface';
import { ProductsService } from './products.service';

const image = (publicId: string): MediaAsset =>
  ({ publicId, url: `https://res.cloudinary.com/demo/${publicId}.jpg` }) as MediaAsset;

/**
 * Solo las dependencias que tocan las operaciones de imágenes de una variante. `findOne` se
 * reemplaza: lo que importa acá es qué se guarda y qué se borra de Cloudinary.
 */
function setup(images: MediaAsset[] | null) {
  const variant = Object.assign(new ProductVariant(), { id: 'v200', productId: 'p1', images });
  const variantsRepository = {
    findOne: jest.fn().mockResolvedValue(variant),
    save: jest.fn().mockImplementation(async (saved: ProductVariant) => saved),
  };
  const cloudinary = { destroy: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductsService(
    {} as never,
    variantsRepository as never,
    {} as never,
    {} as never,
    cloudinary as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
  return { service, variant, variantsRepository, cloudinary };
}

describe('ProductsService - imágenes de una variante', () => {
  it('borrar la última imagen propia hace que la variante vuelva a usar las del producto', async () => {
    const { service, variant, cloudinary } = setup([image('variante/unica')]);

    await service.removeVariantImage('p1', 'v200', 'variante/unica');

    expect(cloudinary.destroy).toHaveBeenCalledWith('variante/unica', 'image');
    expect(variant.images).toBeNull();
  });

  it('borrar una de varias deja el resto como propias', async () => {
    const { service, variant } = setup([image('variante/a'), image('variante/b')]);

    await service.removeVariantImage('p1', 'v200', 'variante/a');

    expect(variant.images).toEqual([image('variante/b')]);
  });

  it('nunca borra de Cloudinary una imagen del producto pedida "como de la variante"', async () => {
    const { service, cloudinary, variantsRepository } = setup(null);

    await expect(
      service.removeVariantImage('p1', 'v200', 'essence-vapes/products/le-male-elixir/foto'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(cloudinary.destroy).not.toHaveBeenCalled();
    expect(variantsRepository.save).not.toHaveBeenCalled();
  });
});
