import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';

type EntityClassOrSchema = new (...args: never[]) => unknown;
import { Provider } from '@nestjs/common';
import { Repository } from 'typeorm';

import { Role } from '../../../common/enums/system-role.enum';
import { User } from '../../auth/entities/user.entity';
import { AdminNotification } from '../entities/admin-notification.entity';
import { NotificationAdminSettings } from '../entities/notification-admin-settings.entity';
import { NotificationDelivery } from '../entities/notification-delivery.entity';
import { NotificationGlobalSettings } from '../entities/notification-global-settings.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { ProductStockAlert } from '../entities/product-stock-alert.entity';
import { PushSubscription } from '../entities/push-subscription.entity';
import { NotificationSettingsService } from '../notification-settings.service';
import { NotificationsRealtimeService } from '../notifications-realtime.service';
import { NotificationsService } from '../notifications.service';

export const NOTIFICATION_ENTITIES: EntityClassOrSchema[] = [
  AdminNotification,
  NotificationDelivery,
  NotificationPreference,
  NotificationAdminSettings,
  NotificationGlobalSettings,
  ProductStockAlert,
  PushSubscription,
  User,
];

/** `ConfigService` mínimo para tests: un mapa plano `clave.con.puntos -> valor`. */
export const fakeConfig = (values: Record<string, unknown> = {}): Provider => ({
  provide: ConfigService,
  useValue: { get: (key: string) => values[key] },
});

/**
 * Módulo de pruebas con una base SQLite EN MEMORIA (nueva y vacía por cada llamada) - nunca
 * toca `essence-vapes.sqlite`. Usa el `NotificationsService` real contra tablas reales, así los
 * tests ejercitan el índice único y las transacciones de verdad en vez de un mock del repo.
 */
export async function createNotificationsTestingModule(options: {
  entities?: EntityClassOrSchema[];
  providers?: Provider[];
  config?: Record<string, unknown>;
} = {}): Promise<TestingModule> {
  const entities = [...NOTIFICATION_ENTITIES, ...(options.entities ?? [])];
  return Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        synchronize: true,
        entities,
      }),
      TypeOrmModule.forFeature(entities),
    ],
    providers: [
      NotificationsService,
      NotificationSettingsService,
      NotificationsRealtimeService,
      fakeConfig({ 'notifications.pushEnabled': true, 'resend.apiKey': 're_test', ...options.config }),
      ...(options.providers ?? []),
    ],
  }).compile();
}

let userCounter = 0;

export async function createUser(
  moduleRef: TestingModule,
  overrides: Partial<User> = {},
): Promise<User> {
  userCounter += 1;
  const repository = moduleRef.get<Repository<User>>(getRepositoryToken(User));
  return repository.save(
    repository.create({
      email: `admin${userCounter}@test.local`,
      password: 'not-a-real-hash',
      fullName: `Admin ${userCounter}`,
      role: Role.ADMIN,
      isActive: true,
      ...overrides,
    }),
  );
}
