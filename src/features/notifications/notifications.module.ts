import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailModule } from '../../common/services/email/email.module';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationAdminSettings } from './entities/notification-admin-settings.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationGlobalSettings } from './entities/notification-global-settings.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { ProductStockAlert } from './entities/product-stock-alert.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { NotificationDeliveryWorker } from './notification-delivery.worker';
import { NotificationDigestService } from './notification-digest.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSystemListener } from './notification-system-listener.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsPushService } from './notifications-push.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationsService } from './notifications.service';
import { StockAlertService } from './stock-alert.service';

/**
 * Global (mismo criterio que `SecurityModule`): pedidos, pagos, productos, mensajes, seguridad y
 * arrepentimientos necesitan publicar eventos, y este módulo no depende de ninguno de ellos -
 * así cualquiera puede inyectar `NotificationsService` sin importar nada ni crear un ciclo.
 * Solo importa `AuthModule` (para `@Auth(Role.ADMIN)` en el controller) y `EmailModule`.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminNotification,
      NotificationDelivery,
      NotificationPreference,
      NotificationAdminSettings,
      NotificationGlobalSettings,
      ProductStockAlert,
      PushSubscription,
      User,
    ]),
    AuthModule,
    EmailModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationSettingsService,
    NotificationsRealtimeService,
    StockAlertService,
    NotificationsPushService,
    NotificationDeliveryWorker,
    NotificationDigestService,
    NotificationSystemListener,
    NotificationSchedulerService,
  ],
  exports: [NotificationsService, NotificationSettingsService, StockAlertService],
})
export class NotificationsModule {}
