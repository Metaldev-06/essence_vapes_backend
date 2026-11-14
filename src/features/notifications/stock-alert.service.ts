import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';

import { DataSource, In, IsNull, LessThan, Not, Repository } from 'typeorm';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductStockAlert } from './entities/product-stock-alert.entity';
import { StockAlertState } from './enums/notification.enums';
import { sanitizeErrorMessage } from './helpers/notification-text.helper';
import {
  stockBackEvent,
  stockLowEvent,
  stockOutEvent,
  stockReorderEvent,
  type NotificationEvent,
  type StockSubject,
} from './notification-events';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsService } from './notifications.service';

/** Mismo valor que `BASE_VARIANT_ID` de productos - duplicado a propósito para que este módulo
 *  no importe el mapper de otro feature solo por una constante. */
const BASE_VARIANT_ID = 'base';

export interface StockPair {
  readonly productId: string;
  readonly variantId: string;
}

interface StockSnapshot extends StockPair {
  readonly label: string;
  readonly stock: number;
}

/** Función pura: el estado que corresponde a un stock dado. Umbral 0 = "stock bajo" desactivado. */
export function computeStockState(stock: number, threshold: number): StockAlertState {
  if (stock <= 0) return StockAlertState.OUT;
  if (threshold > 0 && stock <= threshold) return StockAlertState.LOW;
  return StockAlertState.OK;
}

/**
 * Qué evento corresponde a una transición de estado - `null` si no hay nada que avisar. Solo se
 * llama cuando `previous !== next`, así que mientras un producto siga en el mismo estado esta
 * función ni siquiera se evalúa: de ahí sale la garantía de "no repetir alertas".
 */
export function eventForTransition(
  previous: StockAlertState,
  next: StockAlertState,
  subject: StockSubject,
  threshold: number,
): NotificationEvent | null {
  if (next === StockAlertState.OUT) return stockOutEvent(subject);
  if (previous === StockAlertState.OUT) return stockBackEvent(subject);
  if (next === StockAlertState.LOW) return stockLowEvent(subject, threshold);
  // LOW -> OK: se repuso antes de agotarse, no hace falta avisar.
  return null;
}

/**
 * Alertas de inventario. `evaluate()` se llama (sin esperar) desde cada punto que mueve stock -
 * checkout, vencimiento de reservas, ajustes y ediciones desde el panel - y además corre un
 * barrido periódico como red de seguridad (`NotificationSchedulerService`).
 *
 * Igual que `NotificationsService.publish`, `evaluate()` nunca lanza: un problema acá no puede
 * romper una compra ni un ajuste de stock.
 */
@Injectable()
export class StockAlertService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProductStockAlert)
    private readonly alertsRepository: Repository<ProductStockAlert>,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: NotificationSettingsService,
  ) {}

  async evaluate(pairs: readonly StockPair[]): Promise<void> {
    if (pairs.length === 0) return;
    try {
      const snapshots = await this.loadSnapshots(pairs);
      await this.evaluateSnapshots(snapshots, false);
    } catch (error) {
      LoggerHelper(
        `No se pudieron evaluar las alertas de stock: ${sanitizeErrorMessage(error)}`,
        'StockAlertService',
        true,
      );
    }
  }

  /**
   * Barrido completo del catálogo activo. Un producto/variante que nunca se había visto se
   * registra en silencio con su estado actual (línea de base): así el primer arranque del
   * sistema no dispara una alerta por cada producto que ya estaba agotado desde antes.
   */
  async sweep(): Promise<void> {
    const snapshots = await this.loadAllActiveSnapshots();
    await this.evaluateSnapshots(snapshots, true);
    await this.remindReorders();
  }

  private async evaluateSnapshots(snapshots: StockSnapshot[], baselineUnseen: boolean): Promise<void> {
    if (snapshots.length === 0) return;

    const global = await this.settingsService.getGlobal();
    const rows = await this.alertsRepository.find({
      where: { productId: In([...new Set(snapshots.map((snapshot) => snapshot.productId))]) },
    });
    const byKey = new Map(rows.map((row) => [`${row.productId}:${row.variantId}`, row]));

    for (const snapshot of snapshots) {
      const existing = byKey.get(`${snapshot.productId}:${snapshot.variantId}`);
      const threshold = existing?.threshold ?? global.lowStockThreshold;
      const next = computeStockState(snapshot.stock, threshold);

      if (!existing) {
        // Desde un punto que acaba de mover el stock, "nunca visto" se trata como si antes
        // hubiera estado OK (para no perder la primera alerta); desde el barrido es línea de base.
        const created = await this.createRow(snapshot, baselineUnseen ? next : StockAlertState.OK);
        if (!created || baselineUnseen || next === StockAlertState.OK) continue;
        await this.transition(created, next, snapshot, threshold);
        continue;
      }

      if (existing.lastState !== next) await this.transition(existing, next, snapshot, threshold);
    }
  }

  /**
   * Aplica la transición con un UPDATE condicionado al estado anterior: si dos evaluaciones
   * simultáneas ven el mismo cambio, solo una lo "gana" (`affected === 1`) y notifica. El
   * `episode` además forma parte del `dedupeKey`, así que aun en el peor caso el índice único de
   * notificaciones frena el duplicado.
   */
  private async transition(
    row: ProductStockAlert,
    next: StockAlertState,
    snapshot: StockSnapshot,
    threshold: number,
  ): Promise<void> {
    const previous = row.lastState;
    const episode = row.episode + 1;
    const result = await this.alertsRepository.update(
      { id: row.id, lastState: previous, episode: row.episode },
      { lastState: next, episode, stateChangedAt: new Date(), reorderNotifiedAt: null },
    );
    if (!result.affected) return;

    const event = eventForTransition(previous, next, { ...snapshot, episode }, threshold);
    if (event) await this.notificationsService.publish(event);
  }

  private async createRow(snapshot: StockSnapshot, state: StockAlertState): Promise<ProductStockAlert | null> {
    try {
      return await this.alertsRepository.save(
        this.alertsRepository.create({
          productId: snapshot.productId,
          variantId: snapshot.variantId,
          threshold: null,
          lastState: state,
          episode: 0,
          stateChangedAt: new Date(),
          reorderNotifiedAt: null,
        }),
      );
    } catch {
      // Otra evaluación creó la fila en el mismo instante - esa se encarga de la transición.
      return null;
    }
  }

  /** "Requiere reposición": un recordatorio único por episodio para lo que lleva días agotado. */
  private async remindReorders(): Promise<void> {
    const { reorderReminderDays } = await this.settingsService.getGlobal();
    const cutoff = new Date(Date.now() - reorderReminderDays * 86_400_000);
    const pending = await this.alertsRepository.find({
      where: { lastState: StockAlertState.OUT, stateChangedAt: LessThan(cutoff), reorderNotifiedAt: IsNull() },
      take: 100,
    });
    if (pending.length === 0) return;

    const snapshots = await this.loadSnapshots(pending);
    const byKey = new Map(snapshots.map((snapshot) => [`${snapshot.productId}:${snapshot.variantId}`, snapshot]));

    for (const row of pending) {
      const result = await this.alertsRepository.update(
        { id: row.id, reorderNotifiedAt: IsNull() },
        { reorderNotifiedAt: new Date() },
      );
      const snapshot = byKey.get(`${row.productId}:${row.variantId}`);
      // Sin snapshot = el producto fue borrado u ocultado: se marca igual para no reintentar.
      if (!result.affected || !snapshot) continue;
      await this.notificationsService.publish(
        stockReorderEvent({ ...snapshot, episode: row.episode }, reorderReminderDays),
      );
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Lectura de stock - solo productos activos (uno oculto no es accionable para la venta)
  // ---------------------------------------------------------------------------------------------

  private async loadSnapshots(pairs: readonly StockPair[]): Promise<StockSnapshot[]> {
    const productIds = [...new Set(pairs.map((pair) => pair.productId))];
    const variantIds = pairs.filter((pair) => pair.variantId !== BASE_VARIANT_ID).map((pair) => pair.variantId);

    const [products, variants] = await Promise.all([
      this.dataSource.getRepository(Product).find({
        where: { id: In(productIds), isActive: true },
        select: { id: true, brand: true, name: true, variantLabel: true, stock: true },
      }),
      variantIds.length > 0
        ? this.dataSource.getRepository(ProductVariant).find({
            where: { id: In(variantIds) },
            select: { id: true, productId: true, label: true, stock: true },
          })
        : Promise.resolve([] as ProductVariant[]),
    ]);

    return this.toSnapshots(products, variants, pairs);
  }

  private async loadAllActiveSnapshots(): Promise<StockSnapshot[]> {
    const products = await this.dataSource.getRepository(Product).find({
      where: { isActive: true },
      select: { id: true, brand: true, name: true, variantLabel: true, stock: true },
    });
    if (products.length === 0) return [];

    const variants = await this.dataSource.getRepository(ProductVariant).find({
      where: { productId: In(products.map((product) => product.id)) },
      select: { id: true, productId: true, label: true, stock: true },
    });

    const pairs: StockPair[] = [
      ...products.map((product) => ({ productId: product.id, variantId: BASE_VARIANT_ID })),
      ...variants.map((variant) => ({ productId: variant.productId, variantId: variant.id })),
    ];
    return this.toSnapshots(products, variants, pairs);
  }

  private toSnapshots(
    products: Product[],
    variants: ProductVariant[],
    pairs: readonly StockPair[],
  ): StockSnapshot[] {
    const productById = new Map(products.map((product) => [product.id, product]));
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const snapshots: StockSnapshot[] = [];

    for (const pair of pairs) {
      const product = productById.get(pair.productId);
      if (!product) continue;
      const baseName = `${product.brand} ${product.name}`.trim();

      if (pair.variantId === BASE_VARIANT_ID) {
        snapshots.push({
          ...pair,
          label: product.variantLabel ? `${baseName} (${product.variantLabel})` : baseName,
          stock: product.stock,
        });
        continue;
      }

      const variant = variantById.get(pair.variantId);
      if (!variant || variant.productId !== product.id) continue;
      snapshots.push({ ...pair, label: `${baseName} (${variant.label})`, stock: variant.stock });
    }
    return snapshots;
  }

  // ---------------------------------------------------------------------------------------------
  // Umbrales propios por producto/variante (pantalla de configuración)
  // ---------------------------------------------------------------------------------------------

  async listThresholds() {
    const rows = await this.alertsRepository.find({
      where: { threshold: Not(IsNull()) },
      order: { updatedAt: 'DESC' },
    });
    if (rows.length === 0) return [];

    const productIds = [...new Set(rows.map((row) => row.productId))];
    const variantIds = rows.filter((row) => row.variantId !== BASE_VARIANT_ID).map((row) => row.variantId);
    // Acá sí se incluyen productos ocultos: el admin tiene que poder ver y quitar su umbral.
    const [products, variants] = await Promise.all([
      this.dataSource.getRepository(Product).find({
        where: { id: In(productIds) },
        select: { id: true, brand: true, name: true, variantLabel: true, stock: true },
      }),
      variantIds.length > 0
        ? this.dataSource.getRepository(ProductVariant).find({
            where: { id: In(variantIds) },
            select: { id: true, productId: true, label: true, stock: true },
          })
        : Promise.resolve([] as ProductVariant[]),
    ]);
    const snapshots = this.toSnapshots(products, variants, rows);
    const byKey = new Map(snapshots.map((snapshot) => [`${snapshot.productId}:${snapshot.variantId}`, snapshot]));

    return rows.flatMap((row) => {
      const snapshot = byKey.get(`${row.productId}:${row.variantId}`);
      if (!snapshot) return [];
      return [
        {
          productId: row.productId,
          variantId: row.variantId,
          label: snapshot.label,
          stock: snapshot.stock,
          threshold: row.threshold as number,
          state: row.lastState,
        },
      ];
    });
  }

  async setThreshold(productId: string, variantId: string, threshold: number | null) {
    const pair: StockPair = { productId, variantId };
    const [snapshot] = await this.loadSnapshotsIncludingInactive([pair]);
    if (!snapshot) throw new NotFoundException('No se encontró el producto o la variante');

    const existing = await this.alertsRepository.findOne({ where: { productId, variantId } });
    if (existing) {
      await this.alertsRepository.update({ id: existing.id }, { threshold });
    } else if (threshold !== null) {
      const global = await this.settingsService.getGlobal();
      await this.alertsRepository.save(
        this.alertsRepository.create({
          productId,
          variantId,
          threshold,
          // Estado según el umbral GLOBAL anterior: si el nuevo umbral cambia la situación, la
          // evaluación de abajo lo detecta como una transición real.
          lastState: computeStockState(snapshot.stock, global.lowStockThreshold),
          episode: 0,
          stateChangedAt: new Date(),
          reorderNotifiedAt: null,
        }),
      );
    }

    // Un umbral nuevo puede dejar al producto en "stock bajo" ya mismo.
    await this.evaluate([pair]);
    return this.listThresholds();
  }

  private async loadSnapshotsIncludingInactive(pairs: readonly StockPair[]): Promise<StockSnapshot[]> {
    const [products, variants] = await Promise.all([
      this.dataSource.getRepository(Product).find({
        where: { id: In(pairs.map((pair) => pair.productId)) },
        select: { id: true, brand: true, name: true, variantLabel: true, stock: true },
      }),
      this.dataSource.getRepository(ProductVariant).find({
        where: { productId: In(pairs.map((pair) => pair.productId)) },
        select: { id: true, productId: true, label: true, stock: true },
      }),
    ]);
    return this.toSnapshots(products, variants, pairs);
  }
}
