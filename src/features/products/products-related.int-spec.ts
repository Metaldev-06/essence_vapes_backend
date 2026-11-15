import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ProductCategory } from './enums/product-category.enum';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

/**
 * "También te puede gustar" contra una base SQLite EN MEMORIA (nunca toca essence-vapes.sqlite):
 * lo que importa verificar es la consulta real - que el producto actual quede afuera y que solo
 * vuelva lo que se muestra.
 */
describe('ProductsService.findRelated', () => {
  let dataSource: DataSource;
  let service: ProductsService;

  async function addProduct(
    id: string,
    overrides: Partial<Product> = {},
    variants: Partial<ProductVariant>[] = [],
  ): Promise<void> {
    await dataSource.getRepository(Product).save(
      Object.assign(new Product(), {
        id,
        brand: 'Marca',
        name: id,
        subtitle: '',
        priceValue: 10000,
        accent: '#000000',
        category: ProductCategory.PERFUMES,
        stock: 1,
        ...overrides,
      }),
    );
    for (const [index, variant] of variants.entries()) {
      await dataSource.getRepository(ProductVariant).save(
        Object.assign(new ProductVariant(), {
          productId: id,
          label: `v${index}`,
          priceValue: 20000,
          stock: 1,
          sortOrder: index,
          ...variant,
        }),
      );
    }
  }

  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [Product, ProductVariant],
      synchronize: true,
    });
    await dataSource.initialize();
    service = new ProductsService(
      dataSource.getRepository(Product),
      dataSource.getRepository(ProductVariant),
      {} as never,
      {} as never,
      {} as never,
      { get: () => false } as never,
      {} as never,
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('nunca incluye al producto que se está viendo, ni ninguno de sus tamaños', async () => {
    await addProduct('le-male-elixir', { stock: 0 }, [{ stock: 1 }, { stock: 2 }, { stock: 3 }]);
    await addProduct('born-in-roma');
    await addProduct('le-beau');

    const related = await service.findRelated('le-male-elixir');

    expect(ids(related).sort()).toEqual(['born-in-roma', 'le-beau']);
  });

  it('los tamaños del producto actual ya no le quitan lugar a los demás', async () => {
    await addProduct('actual', {}, [{}, {}, {}, {}, {}]);
    for (const id of ['a', 'b', 'c', 'd', 'e']) await addProduct(id);

    const related = await service.findRelated('actual');

    expect(related).toHaveLength(4);
    expect(ids(related)).not.toContain('actual');
  });

  it('muestra cada perfume una sola vez, en la presentación que tiene stock', async () => {
    await addProduct('actual');
    // Base agotada, el segundo tamaño con stock.
    await addProduct('le-male-elixir', { stock: 0, variantLabel: '125ml' }, [
      { stock: 0, label: '75ml' },
      { stock: 1, label: '200ml' },
    ]);

    const related = await service.findRelated('actual');

    expect(related).toHaveLength(1);
    expect(related[0].variantLabel).toBe('200ml');
    expect(related[0].stock).toBe(1);
  });

  it('si todos los tamaños están agotados muestra la presentación base', async () => {
    await addProduct('actual');
    await addProduct('agotado', { stock: 0, variantLabel: '100ml' }, [{ stock: 0 }]);

    const [card] = await service.findRelated('actual');

    expect(card.variantId).toBe('base');
    expect(card.variantLabel).toBe('100ml');
  });

  it('solo de la misma categoría y solo productos visibles en la tienda', async () => {
    await addProduct('actual');
    await addProduct('otro-perfume');
    await addProduct('un-decant', { category: ProductCategory.DECANTS });
    await addProduct('oculto', { isActive: false });

    expect(ids(await service.findRelated('actual'))).toEqual(['otro-perfume']);
  });

  it('ordena por acordes compartidos con el producto actual', async () => {
    await addProduct('actual', { accords: ['amaderado', 'dulce', 'especiado'] });
    await addProduct('nada-en-comun', { accords: ['acuático'] });
    await addProduct('muy-parecido', { accords: ['amaderado', 'dulce', 'especiado'] });
    await addProduct('algo-parecido', { accords: ['dulce'] });

    expect(ids(await service.findRelated('actual'))).toEqual(['muy-parecido', 'algo-parecido', 'nada-en-comun']);
  });

  it('un producto inexistente responde 404', async () => {
    await expect(service.findRelated('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });
});
