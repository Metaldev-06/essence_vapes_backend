import { Injectable } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';

import { Between, DataSource, In, IsNull } from 'typeorm';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { MessageThreadState } from '../messages/entities/message-thread-state.entity';
import { ThreadStatus } from '../messages/enums/thread-status.enum';
import { Order } from '../orders/entities/order.entity';
import { DeliveryMethod } from '../orders/enums/delivery-method.enum';
import { LogisticsStatus } from '../orders/enums/logistics-status.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { WithdrawalRequest } from '../withdrawal-requests/entities/withdrawal-request.entity';
import { WithdrawalStatus } from '../withdrawal-requests/enums/withdrawal-status.enum';
import { sanitizeErrorMessage } from './helpers/notification-text.helper';
import { NotificationDigestService } from './notification-digest.service';
import {
  jobFailedEvent,
  orderPaidEvent,
  orderPendingDispatchEvent,
  orderPendingPreparationEvent,
  unansweredMessageEvent,
  unansweredWithdrawalEvent,
} from './notification-events';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsService } from './notifications.service';
import { StockAlertService } from './stock-alert.service';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Nunca se alerta por algo más viejo que esto - evita que el primer arranque del sistema (o un
 *  pedido olvidado hace meses) genere una catarata de avisos atrasados. */
const LOOKBACK_MS = 14 * DAY_MS;
const BATCH = 100;

/** Estados en los que un envío a domicilio todavía no salió del local. */
const NOT_DISPATCHED = [
  LogisticsStatus.PENDING_PREPARATION,
  LogisticsStatus.IN_PREPARATION,
  LogisticsStatus.READY_TO_SHIP,
];
/** Estados en los que un retiro todavía no está listo para entregarse. */
const NOT_READY_FOR_PICKUP = [LogisticsStatus.PENDING_PREPARATION, LogisticsStatus.IN_PREPARATION];

/**
 * Alertas que dependen del paso del tiempo (nadie "dispara" que un pedido lleva 24 h sin
 * prepararse) más las redes de seguridad del sistema: reconciliación de pedidos pagados sin
 * aviso, barrido de stock y retención.
 *
 * Todos los jobs son idempotentes (cada aviso tiene un `dedupeKey` estable por recurso), así que
 * correrlos de más o solaparlos es inofensivo. Lee las tablas de otros features directo por
 * `DataSource` - mismo criterio que `OrdersExpirationService` - para no depender de sus módulos.
 */
@Injectable()
export class NotificationSchedulerService {
  private readonly running = new Set<string>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: NotificationSettingsService,
    private readonly stockAlertService: StockAlertService,
    private readonly digestService: NotificationDigestService,
  ) {}

  @Interval(5 * 60_000)
  async runPeriodicChecks(): Promise<void> {
    await this.runJob('pedidos pagados sin aviso', () => this.reconcilePaidOrders());
    await this.runJob('pedidos demorados', () => this.checkStaleOrders());
    await this.runJob('consultas sin responder', () => this.checkUnanswered());
    await this.runJob('alertas de stock', () => this.stockAlertService.sweep());
  }

  /** Cada hora: el propio servicio decide a quién le toca según su hora y frecuencia. */
  @Cron('5 * * * *')
  async runDigests(): Promise<void> {
    await this.runJob('resumen por correo', () => this.digestService.runDue());
  }

  @Cron('30 4 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async runRetention(): Promise<void> {
    await this.runJob('limpieza de notificaciones', () => this.purgeOldNotifications());
  }

  /**
   * Corre un job sin dejar que su error escape (un `@Interval` que lanza no debe tirar nada
   * abajo) ni que se solape consigo mismo. Un fallo se convierte en una notificación de sistema -
   * salvo que lo que falle sea justamente publicar, en cuyo caso `publish` ya lo absorbe.
   */
  async runJob(name: string, job: () => Promise<unknown>): Promise<void> {
    if (this.running.has(name)) return;
    this.running.add(name);
    try {
      await job();
    } catch (error) {
      const reason = sanitizeErrorMessage(error);
      LoggerHelper(`Falló el proceso programado "${name}": ${reason}`, 'NotificationSchedulerService', true);
      await this.notificationsService.publish(jobFailedEvent(name, reason));
    } finally {
      this.running.delete(name);
    }
  }

  /**
   * Red de seguridad del aviso más importante: si el proceso se cayó entre "la orden quedó
   * pagada" y "se creó la notificación", acá se recupera. Solo mira órdenes que YA están `PAID`
   * en la base (estado que únicamente escribe `PaymentsService` tras confirmar con Mercado
   * Pago), así que nunca puede adelantar un aviso de pago no confirmado.
   */
  async reconcilePaidOrders(): Promise<number> {
    const now = Date.now();
    const orders = await this.dataSource.getRepository(Order).find({
      where: {
        status: OrderStatus.PAID,
        // El margen de 2 min deja terminar al flujo normal antes de considerarlo "perdido".
        paidAt: Between(new Date(now - DAY_MS), new Date(now - 2 * 60_000)),
      },
      order: { paidAt: 'ASC' },
      take: BATCH,
    });

    let recovered = 0;
    for (const order of orders) {
      const event = orderPaidEvent(order);
      if (await this.notificationsService.existsByDedupeKey(event.dedupeKey)) continue;
      const created = await this.notificationsService.publish(event);
      if (created.length > 0) recovered += 1;
    }
    if (recovered > 0) {
      LoggerHelper(`Reconciliación: ${recovered} pedido(s) pagado(s) sin aviso recuperado(s)`, 'NotificationSchedulerService');
    }
    return recovered;
  }

  async checkStaleOrders(): Promise<void> {
    const { pendingPreparationHours, pendingDispatchHours } = await this.settingsService.getGlobal();
    const now = Date.now();
    const orders = this.dataSource.getRepository(Order);
    const lookback = new Date(now - LOOKBACK_MS);

    const unprepared = await orders.find({
      where: {
        status: OrderStatus.PAID,
        logisticsStatus: LogisticsStatus.PENDING_PREPARATION,
        paidAt: Between(lookback, new Date(now - pendingPreparationHours * HOUR_MS)),
      },
      take: BATCH,
    });
    for (const order of unprepared) {
      await this.notificationsService.publish(orderPendingPreparationEvent(order, pendingPreparationHours));
    }

    const dispatchCutoff = new Date(now - pendingDispatchHours * HOUR_MS);
    const undispatched = await orders.find({
      where: [
        {
          status: OrderStatus.PAID,
          deliveryMethod: DeliveryMethod.HOME_DELIVERY,
          logisticsStatus: In(NOT_DISPATCHED),
          paidAt: Between(lookback, dispatchCutoff),
        },
        {
          status: OrderStatus.PAID,
          deliveryMethod: DeliveryMethod.PICKUP,
          logisticsStatus: In(NOT_READY_FOR_PICKUP),
          paidAt: Between(lookback, dispatchCutoff),
        },
      ],
      take: BATCH,
    });
    for (const order of undispatched) {
      await this.notificationsService.publish(orderPendingDispatchEvent(order, pendingDispatchHours));
    }
  }

  async checkUnanswered(): Promise<void> {
    const { unansweredHours } = await this.settingsService.getGlobal();
    const now = Date.now();
    const cutoff = new Date(now - unansweredHours * HOUR_MS);
    const lookback = new Date(now - LOOKBACK_MS);

    const withdrawals = await this.dataSource.getRepository(WithdrawalRequest).find({
      where: { status: WithdrawalStatus.RECIBIDO, createdAt: Between(lookback, cutoff) },
      take: BATCH,
    });
    for (const request of withdrawals) {
      await this.notificationsService.publish(
        unansweredWithdrawalEvent(request.id, request.trackingCode, unansweredHours),
      );
    }

    // Solo conversaciones que nadie tocó todavía: sin primera respuesta y aún en un estado
    // "abierto" (una que el admin ya marcó en proceso / esperando al cliente no es un olvido).
    const threads = await this.dataSource.getRepository(MessageThreadState).find({
      where: {
        firstReceivedAt: Between(lookback, cutoff),
        firstRespondedAt: IsNull(),
        status: In([ThreadStatus.NUEVO, ThreadStatus.PENDIENTE]),
      },
      take: BATCH,
    });
    for (const thread of threads) {
      await this.notificationsService.publish(
        unansweredMessageEvent(thread.resendThreadId, thread.inbox, unansweredHours),
      );
    }
  }

  async purgeOldNotifications(): Promise<number> {
    const { retentionDays } = await this.settingsService.getGlobal();
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    let total = 0;
    // `purgeOlderThan` borra de a tandas - se repite hasta vaciar, con tope para no monopolizar.
    for (let i = 0; i < 20; i += 1) {
      const purged = await this.notificationsService.purgeOlderThan(cutoff);
      total += purged;
      if (purged === 0) break;
    }
    if (total > 0) LoggerHelper(`Retención: ${total} notificación(es) eliminada(s)`, 'NotificationSchedulerService');
    return total;
  }
}
