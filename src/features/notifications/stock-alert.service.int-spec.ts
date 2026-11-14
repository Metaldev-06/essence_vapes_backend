import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductCategory } from '../products/enums/product-category.enum';
import { AdminNotification } from './entities/admin-notification.entity';
import { ProductStockAlert } from './entities/product-stock-alert.entity';
import { NotificationType, StockAlertState } from './enums/notification.enums';
import { NotificationSettingsService } from './notification-settings.service';
import { StockAlertService, computeStockState } from './stock-alert.service';
import { createNotificationsTestingModule, createUser } from './testing/notifications-testing';

const BASE = 'base';

describe('StockAlertService', () => {
  let moduleRef: TestingModule;
  let service: StockAlertService;
  let settings: NotificationSettingsService;
  let products: Repository<Product>;
  let variants: Repository<ProductVariant>;
  let notifications: Repository<AdminNotification>;
  let alerts: Repository<ProductStockAlert>;

  const createProduct = (id: string, stock: number, overrides: Partial<Product> = {}) =>
    products.save(
      products.create({
        id,
        brand: 'Dior',
        name: 'Sauvage',
        subtitle: 'Eau de parfum',
        notes: [],
        priceValue: 100_000,
        accent: '#8b5cf6',
        category: Object.values(ProductCategory)[0],
        styles: [],
        stock,
        isActive: true,
        ...overrides,
      }),
    );

  const setStock = (id: string, stock: number) => products.update({ id }, { stock });
  const pair = (productId: string, variantId = BASE) => [{ productId, variantId }];
  const typesFor = async () =>
    (await notifications.find({ order: { createdAt: 'ASC' } })).map((notification) => notification.type);

  beforeEach(async () => {
    moduleRef = await createNotificationsTestingModule({
      entities: [Product, ProductVariant],
      providers: [StockAlertService],
    });
    service = moduleRef.get(StockAlertService);
    settings = moduleRef.get(NotificationSettingsService);
    products = moduleRef.get(getRepositoryToken(Product));
    variants = moduleRef.get(getRepositoryToken(ProductVariant));
    notifications = moduleRef.get(getRepositoryToken(AdminNotification));
    alerts = moduleRef.get(getRepositoryToken(ProductStockAlert));
    await createUser(moduleRef);
    // Umbral global por defecto: 3.
    await settings.getGlobal();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('computeStockState', () => {
    it('clasifica según el umbral', () => {
      expect(computeStockState(0, 3)).toBe(StockAlertState.OUT);
      expect(computeStockState(-1, 3)).toBe(StockAlertState.OUT);
      expect(computeStockState(3, 3)).toBe(StockAlertState.LOW);
      expect(computeStockState(4, 3)).toBe(StockAlertState.OK);
      // Umbral 0 = "stock bajo" desactivado.
      expect(computeStockState(1, 0)).toBe(StockAlertState.OK);
    });
  });

  // Escenario 4 de la tarea: cruzar el umbral genera la alerta correspondiente.
  it('alerta "stock bajo" cuando el producto cruza el umbral', async () => {
    await createProduct('sauvage', 10);
    await service.sweep();
    expect(await notifications.count()).toBe(0);

    await setStock('sauvage', 3);
    await service.evaluate(pair('sauvage'));

    const [alert] = await notifications.find();
    expect(alert.type).toBe(NotificationType.STOCK_LOW);
    expect(alert.title).toBe('Stock bajo: Dior Sauvage');
    expect(alert.body).toContain('Quedan 3 unidades');
    expect(alert.resourceUrl).toBe('/admin/productos/sauvage/editar');
  });

  it('alerta "sin stock" al llegar a cero y "volvió a tener stock" al reponerse', async () => {
    await createProduct('sauvage', 10);
    await service.sweep();

    await setStock('sauvage', 0);
    await service.evaluate(pair('sauvage'));
    await setStock('sauvage', 20);
    await service.evaluate(pair('sauvage'));

    expect(await typesFor()).toEqual([NotificationType.STOCK_OUT, NotificationType.STOCK_BACK]);
  });

  // Escenario 5 de la tarea: las alertas de stock no se repiten innecesariamente.
  it('no repite la alerta mientras el producto sigue en el mismo estado', async () => {
    await createProduct('sauvage', 10);
    await service.sweep();

    await setStock('sauvage', 3);
    await service.evaluate(pair('sauvage'));
    // Sigue bajo, con otro valor: mismo estado, ninguna alerta nueva.
    await setStock('sauvage', 2);
    await service.evaluate(pair('sauvage'));
    await setStock('sauvage', 1);
    await service.evaluate(pair('sauvage'));
    await service.sweep();
    await service.sweep();

    expect(await typesFor()).toEqual([NotificationType.STOCK_LOW]);
  });

  it('una sola alerta aunque el mismo cambio se evalúe varias veces en simultáneo', async () => {
    await createProduct('sauvage', 10);
    await service.sweep();
    await setStock('sauvage', 0);

    await Promise.all(Array.from({ length: 6 }, () => service.evaluate(pair('sauvage'))));

    expect(await typesFor()).toEqual([NotificationType.STOCK_OUT]);
  });

  it('vuelve a alertar en un episodio nuevo (se repuso y se agotó otra vez)', async () => {
    await createProduct('sauvage', 10);
    await service.sweep();

    for (const stock of [0, 10, 0]) {
      await setStock('sauvage', stock);
      await service.evaluate(pair('sauvage'));
    }

    expect(await typesFor()).toEqual([
      NotificationType.STOCK_OUT,
      NotificationType.STOCK_BACK,
      NotificationType.STOCK_OUT,
    ]);
  });

  it('no avisa cuando el stock sube de bajo a normal sin haberse agotado', async () => {
    await createProduct('sauvage', 2);
    await service.sweep();

    await setStock('sauvage', 50);
    await service.evaluate(pair('sauvage'));

    expect(await notifications.count()).toBe(0);
    expect((await alerts.findOneByOrFail({ productId: 'sauvage' })).lastState).toBe(StockAlertState.OK);
  });

  it('el primer barrido registra el estado actual en silencio (sin catarata inicial)', async () => {
    await createProduct('agotado', 0);
    await createProduct('bajo', 1);
    await createProduct('normal', 40);

    await service.sweep();

    expect(await notifications.count()).toBe(0);
    expect(await alerts.count()).toBe(3);
  });

  it('un producto nunca visto que se agota por una venta sí alerta', async () => {
    await createProduct('nuevo', 0);

    await service.evaluate(pair('nuevo'));

    expect(await typesFor()).toEqual([NotificationType.STOCK_OUT]);
  });

  it('ignora productos ocultos', async () => {
    await createProduct('oculto', 5, { isActive: false });
    await service.sweep();
    await setStock('oculto', 0);

    await service.evaluate(pair('oculto'));
    await service.sweep();

    expect(await notifications.count()).toBe(0);
  });

  it('evalúa cada variante por separado', async () => {
    await createProduct('sauvage', 10, { variantLabel: '60 ml' });
    const variant = await variants.save(
      variants.create({ productId: 'sauvage', label: '100 ml', priceValue: 150_000, stock: 10 }),
    );
    await service.sweep();

    await variants.update({ id: variant.id }, { stock: 0 });
    await service.evaluate(pair('sauvage', variant.id));

    const [alert] = await notifications.find();
    expect(alert.title).toBe('Sin stock: Dior Sauvage (100 ml)');
    expect((await alerts.findOneByOrFail({ productId: 'sauvage', variantId: BASE })).lastState).toBe(
      StockAlertState.OK,
    );
  });

  describe('umbrales', () => {
    it('el umbral propio del producto le gana al global', async () => {
      await createProduct('sauvage', 8);
      await service.sweep();

      // Con el global (3) 8 unidades es normal; con umbral propio de 10 ya es stock bajo.
      const thresholds = await service.setThreshold('sauvage', BASE, 10);

      expect(thresholds).toEqual([
        expect.objectContaining({ productId: 'sauvage', threshold: 10, stock: 8, state: StockAlertState.LOW }),
      ]);
      expect(await typesFor()).toEqual([NotificationType.STOCK_LOW]);
    });

    it('quitar el umbral propio vuelve al global', async () => {
      await createProduct('sauvage', 8);
      await service.sweep();
      await service.setThreshold('sauvage', BASE, 10);

      const thresholds = await service.setThreshold('sauvage', BASE, null);

      expect(thresholds).toEqual([]);
      expect((await alerts.findOneByOrFail({ productId: 'sauvage' })).lastState).toBe(StockAlertState.OK);
    });

    it('cambiar el umbral global re-evalúa en el siguiente barrido', async () => {
      await createProduct('sauvage', 8);
      await service.sweep();

      await settings.updateGlobal({ lowStockThreshold: 10 });
      await service.sweep();

      expect(await typesFor()).toEqual([NotificationType.STOCK_LOW]);
    });
  });

  it('recuerda la reposición una sola vez por episodio', async () => {
    await createProduct('sauvage', 10);
    await service.sweep();
    await setStock('sauvage', 0);
    await service.evaluate(pair('sauvage'));
    // Simula que lleva 10 días agotado (el default es recordar a los 7).
    await alerts.update({ productId: 'sauvage' }, { stateChangedAt: new Date(Date.now() - 10 * 86_400_000) });

    await service.sweep();
    await service.sweep();

    expect(await typesFor()).toEqual([NotificationType.STOCK_OUT, NotificationType.STOCK_REORDER]);
  });

  it('nunca lanza aunque falle por dentro', async () => {
    jest.spyOn(settings, 'getGlobal').mockRejectedValueOnce(new Error('db caída'));
    await createProduct('sauvage', 0);

    await expect(service.evaluate(pair('sauvage'))).resolves.toBeUndefined();
  });
});
