import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, In, MoreThanOrEqual, Not } from 'typeorm';

import { Role } from '../../common/enums/system-role.enum';
import { LoggerHelper } from '../../common/helpers/logger.helper';
import { EmailService } from '../../common/services/email/email.service';
import { User } from '../auth/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { LogisticsStatus } from '../orders/enums/logistics-status.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { WithdrawalRequest } from '../withdrawal-requests/entities/withdrawal-request.entity';
import { WithdrawalStatus } from '../withdrawal-requests/enums/withdrawal-status.enum';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationAdminSettings } from './entities/notification-admin-settings.entity';
import { ProductStockAlert } from './entities/product-stock-alert.entity';
import {
  DigestFrequency,
  NotificationPriority,
  NotificationType,
  StockAlertState,
} from './enums/notification.enums';
import { argentinaClock } from './helpers/quiet-hours.helper';
import { buildDigestEmail, type DigestData } from './notification-emails';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsService } from './notifications.service';

const DAY_MS = 86_400_000;
const MONDAY = 1;

/**
 * Resumen del negocio por correo, por admin y según su propia frecuencia (diaria / semanal los
 * lunes) y hora elegida. `lastDigestKey` (la fecha local del último envío) es lo que impide
 * mandarlo dos veces el mismo día aunque el job corra cada hora: se marca solo después de un
 * envío exitoso, así que si Resend falla se reintenta en la pasada siguiente.
 */
@Injectable()
export class NotificationDigestService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settingsService: NotificationSettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /** Devuelve cuántos resúmenes se enviaron en esta pasada. */
  async runDue(now: Date = new Date()): Promise<number> {
    if (!this.configService.get<string>('resend.apiKey')) return 0;

    const clock = argentinaClock(now);
    const candidates = await this.settingsService.findAdminsWithDigest();
    let sent = 0;

    for (const settings of candidates) {
      if (!this.isDue(settings, clock)) continue;

      const admin = await this.dataSource.getRepository(User).findOne({
        where: { id: settings.adminId, role: Role.ADMIN, isActive: true },
      });
      if (!admin) continue;

      const weekly = settings.digestFrequency === DigestFrequency.WEEKLY;
      const data = await this.collect(admin.id, weekly, now);
      const delivered = await this.emailService.send(
        buildDigestEmail({
          from: this.emailService.addresses.noReply,
          to: admin.email,
          frontendUrl: this.configService.get<string>('accountSecurity.frontendUrl')!,
          adminName: admin.fullName,
          data,
        }),
      );

      if (delivered) {
        await this.settingsService.markDigestSent(admin.id, clock.dateKey);
        sent += 1;
      } else {
        LoggerHelper(`No se pudo enviar el resumen a un administrador - se reintenta en la próxima pasada`, 'NotificationDigestService', true);
      }
    }
    return sent;
  }

  private isDue(
    settings: NotificationAdminSettings,
    clock: { dateKey: string; hour: number; weekday: number },
  ): boolean {
    if (settings.lastDigestKey === clock.dateKey) return false;
    if (clock.hour < settings.digestHour) return false;
    if (settings.digestFrequency === DigestFrequency.WEEKLY) return clock.weekday === MONDAY;
    return settings.digestFrequency === DigestFrequency.DAILY;
  }

  async collect(adminId: string, weekly: boolean, now: Date): Promise<DigestData> {
    const since = new Date(now.getTime() - (weekly ? 7 : 1) * DAY_MS);
    const orders = this.dataSource.getRepository(Order);
    const stockAlerts = this.dataSource.getRepository(ProductStockAlert);

    const [sales, pendingPreparation, pendingDispatch, outOfStock, lowStock, openWithdrawals, unread, highlights] =
      await Promise.all([
        orders
          .createQueryBuilder('o')
          .select('COUNT(*)', 'count')
          .addSelect('COALESCE(SUM(o.totalValue), 0)', 'revenue')
          // Solo lo que sigue cobrado: un pedido reembolsado en el período no cuenta como venta.
          .where('o.status = :status', { status: OrderStatus.PAID })
          .andWhere('o.paidAt >= :since', { since })
          .getRawOne<{ count: string; revenue: string }>(),
        orders.count({ where: { status: OrderStatus.PAID, logisticsStatus: LogisticsStatus.PENDING_PREPARATION } }),
        orders.count({
          where: {
            status: OrderStatus.PAID,
            logisticsStatus: In([LogisticsStatus.IN_PREPARATION, LogisticsStatus.READY_TO_SHIP]),
          },
        }),
        stockAlerts.count({ where: { lastState: StockAlertState.OUT } }),
        stockAlerts.count({ where: { lastState: StockAlertState.LOW } }),
        this.dataSource.getRepository(WithdrawalRequest).count({ where: { status: WithdrawalStatus.RECIBIDO } }),
        this.notificationsService.countUnread(adminId),
        this.dataSource.getRepository(AdminNotification).find({
          where: {
            recipientId: adminId,
            priority: In([NotificationPriority.CRITICAL, NotificationPriority.HIGH]),
            // Los pedidos pagados ya están resumidos arriba como número.
            type: Not(NotificationType.ORDER_PAID),
            createdAt: MoreThanOrEqual(since),
          },
          order: { createdAt: 'DESC' },
          take: 6,
        }),
      ]);

    return {
      periodLabel: weekly ? 'los últimos 7 días' : 'las últimas 24 horas',
      paidOrders: Number(sales?.count ?? 0),
      revenueValue: Number(sales?.revenue ?? 0),
      pendingPreparation,
      pendingDispatch,
      outOfStock,
      lowStock,
      openWithdrawals,
      unreadNotifications: unread,
      highlights: highlights.map((notification) => ({ title: notification.title, body: notification.body })),
    };
  }
}
