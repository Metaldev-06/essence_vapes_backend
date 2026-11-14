import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { UpdateGlobalSettingsDto } from './dto/update-global-settings.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { NotificationAdminSettings } from './entities/notification-admin-settings.entity';
import {
  GLOBAL_SETTINGS_ID,
  NotificationGlobalSettings,
} from './entities/notification-global-settings.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { DigestFrequency, NotificationType } from './enums/notification.enums';
import { isUniqueViolation } from './helpers/db-error.helper';
import { NOTIFICATION_CATALOG, isCritical, resolveChannels } from './notification-catalog';

const DEFAULT_ADMIN_SETTINGS = {
  quietHoursEnabled: false,
  quietHoursStart: 22 * 60,
  quietHoursEnd: 8 * 60,
  digestFrequency: DigestFrequency.OFF,
  digestHour: 9,
} as const;

export interface AdminSettingsView {
  readonly quietHoursEnabled: boolean;
  readonly quietHoursStart: number;
  readonly quietHoursEnd: number;
  readonly digestFrequency: DigestFrequency;
  readonly digestHour: number;
}

const toAdminSettingsView = (settings: NotificationAdminSettings | null): AdminSettingsView => ({
  quietHoursEnabled: settings?.quietHoursEnabled ?? DEFAULT_ADMIN_SETTINGS.quietHoursEnabled,
  quietHoursStart: settings?.quietHoursStart ?? DEFAULT_ADMIN_SETTINGS.quietHoursStart,
  quietHoursEnd: settings?.quietHoursEnd ?? DEFAULT_ADMIN_SETTINGS.quietHoursEnd,
  digestFrequency: settings?.digestFrequency ?? DEFAULT_ADMIN_SETTINGS.digestFrequency,
  digestHour: settings?.digestHour ?? DEFAULT_ADMIN_SETTINGS.digestHour,
});

/**
 * Configuración de notificaciones: preferencias y ajustes personales (siempre del admin que
 * hace el request - ningún método acepta editar los de otro) y reglas globales del negocio.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferencesRepository: Repository<NotificationPreference>,
    @InjectRepository(NotificationAdminSettings)
    private readonly adminSettingsRepository: Repository<NotificationAdminSettings>,
    @InjectRepository(NotificationGlobalSettings)
    private readonly globalSettingsRepository: Repository<NotificationGlobalSettings>,
    private readonly configService: ConfigService,
  ) {}

  /** Fila única, creada de forma perezosa con los defaults de la entidad. */
  async getGlobal(): Promise<NotificationGlobalSettings> {
    const existing = await this.globalSettingsRepository.findOne({ where: { id: GLOBAL_SETTINGS_ID } });
    if (existing) return existing;

    try {
      await this.globalSettingsRepository.insert({ id: GLOBAL_SETTINGS_ID });
    } catch (error) {
      // Dos requests simultáneos crearon la fila a la vez - gana cualquiera, se relee abajo.
      if (!isUniqueViolation(error)) throw error;
    }
    return this.globalSettingsRepository.findOneOrFail({ where: { id: GLOBAL_SETTINGS_ID } });
  }

  async updateGlobal(dto: UpdateGlobalSettingsDto): Promise<NotificationGlobalSettings> {
    const settings = await this.getGlobal();
    Object.assign(settings, dto);
    return this.globalSettingsRepository.save(settings);
  }

  async getAdminSettings(adminId: string): Promise<NotificationAdminSettings | null> {
    return this.adminSettingsRepository.findOne({ where: { adminId } });
  }

  async getAdminSettingsFor(adminIds: string[]): Promise<Map<string, NotificationAdminSettings>> {
    if (adminIds.length === 0) return new Map();
    const rows = await this.adminSettingsRepository.find({ where: { adminId: In(adminIds) } });
    return new Map(rows.map((row) => [row.adminId, row]));
  }

  async getPreferencesFor(
    adminIds: string[],
    type: NotificationType,
  ): Promise<Map<string, NotificationPreference>> {
    if (adminIds.length === 0) return new Map();
    const rows = await this.preferencesRepository.find({ where: { adminId: In(adminIds), type } });
    return new Map(rows.map((row) => [row.adminId, row]));
  }

  /** Todo lo que la pantalla "Configuración de notificaciones" necesita, en una sola respuesta. */
  async getView(adminId: string) {
    const [preferences, adminSettings, global] = await Promise.all([
      this.preferencesRepository.find({ where: { adminId } }),
      this.getAdminSettings(adminId),
      this.getGlobal(),
    ]);
    const byType = new Map(preferences.map((preference) => [preference.type, preference]));

    const events = (Object.keys(NOTIFICATION_CATALOG) as NotificationType[]).map((type) => {
      const definition = NOTIFICATION_CATALOG[type];
      const preference = byType.get(type) ?? null;
      const channels = resolveChannels(type, preference);
      return {
        type,
        category: definition.category,
        priority: definition.priority,
        label: definition.label,
        description: definition.description,
        critical: isCritical(type),
        enabled: preference ? preference.enabled : true,
        inApp: channels.inApp,
        push: preference ? preference.push : definition.defaults.push,
        email: preference ? preference.email : definition.defaults.email,
      };
    });

    return {
      events,
      settings: toAdminSettingsView(adminSettings),
      global: this.toGlobalView(global),
      channels: {
        push: Boolean(this.configService.get<boolean>('notifications.pushEnabled')),
        email: Boolean(this.configService.get<string>('resend.apiKey')),
      },
    };
  }

  toGlobalView(global: NotificationGlobalSettings) {
    return {
      lowStockThreshold: global.lowStockThreshold,
      pendingPreparationHours: global.pendingPreparationHours,
      pendingDispatchHours: global.pendingDispatchHours,
      unansweredHours: global.unansweredHours,
      reorderReminderDays: global.reorderReminderDays,
      retentionDays: global.retentionDays,
    };
  }

  async updatePreferences(adminId: string, dto: UpdatePreferencesDto) {
    if (dto.events?.length) {
      const existing = await this.preferencesRepository.find({
        where: { adminId, type: In(dto.events.map((event) => event.type)) },
      });
      const byType = new Map(existing.map((preference) => [preference.type, preference]));

      const rows = dto.events.map((event) => {
        const row = byType.get(event.type) ?? this.preferencesRepository.create({ adminId, type: event.type });
        row.enabled = event.enabled;
        // Un evento crítico no puede sacarse del panel (ver `resolveChannels`) - se guarda ya
        // normalizado para que lo persistido coincida con lo que realmente va a pasar.
        row.inApp = isCritical(event.type) ? true : event.inApp;
        row.push = event.push;
        row.email = event.email;
        return row;
      });
      await this.preferencesRepository.save(rows);
    }

    const { events: _events, ...personal } = dto;
    if (Object.values(personal).some((value) => value !== undefined)) {
      const current =
        (await this.getAdminSettings(adminId)) ??
        this.adminSettingsRepository.create({ adminId, ...DEFAULT_ADMIN_SETTINGS, lastDigestKey: null });
      for (const [key, value] of Object.entries(personal)) {
        if (value !== undefined) (current as unknown as Record<string, unknown>)[key] = value;
      }
      await this.adminSettingsRepository.save(current);
    }

    return this.getView(adminId);
  }

  async markDigestSent(adminId: string, digestKey: string): Promise<void> {
    await this.adminSettingsRepository.update({ adminId }, { lastDigestKey: digestKey });
  }

  findAdminsWithDigest(): Promise<NotificationAdminSettings[]> {
    return this.adminSettingsRepository.find({
      where: { digestFrequency: In([DigestFrequency.DAILY, DigestFrequency.WEEKLY]) },
    });
  }
}
