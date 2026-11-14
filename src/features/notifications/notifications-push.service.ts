import { createHash } from 'crypto';

import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';
import * as webpush from 'web-push';

import { LoggerHelper } from '../../common/helpers/logger.helper';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';
import { PushSubscription } from './entities/push-subscription.entity';
import { isUniqueViolation } from './helpers/db-error.helper';
import { sanitizeErrorMessage } from './helpers/notification-text.helper';

/**
 * Servicios de push de los navegadores soportados. El backend hace requests salientes al
 * `endpoint` que manda el cliente, así que solo se aceptan estos hosts: sin esta lista, el alta
 * de una suscripción serviría para hacerle pegar al servidor contra una URL arbitraria (SSRF).
 */
const ALLOWED_PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Opera, Brave, Samsung Internet
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)notify\.windows\.com$/, // Edge heredado / Windows
  /(^|\.)push\.apple\.com$/, // Safari (macOS y iOS 16.4+ instalado como app)
];

const MAX_DEVICES_PER_ADMIN = 10;
/** Fallos consecutivos tras los cuales una suscripción se da por muerta y se elimina. */
const MAX_CONSECUTIVE_FAILURES = 8;

export interface PushPayload {
  readonly title: string;
  readonly body: string;
  /** Ruta interna del panel a abrir al tocar la notificación. */
  readonly url: string;
  /** Agrupa/reemplaza avisos del mismo recurso en el sistema operativo. */
  readonly tag: string;
  readonly critical: boolean;
}

export interface PushSendResult {
  /** Dispositivos a los que se intentó enviar. */
  readonly attempted: number;
  readonly delivered: number;
  readonly lastError: string | null;
}

/** Etiqueta legible para la lista de dispositivos - nunca se guarda el User-Agent completo. */
export function describeDevice(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navegador';
  const system = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'dispositivo desconocido';
  return `${browser} en ${system}`;
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && ALLOWED_PUSH_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Web Push (VAPID). Las suscripciones son siempre del admin autenticado: alta, listado y baja
 * filtran por `adminId`. Sin claves VAPID configuradas el canal queda apagado sin romper nada
 * (mismo criterio que Resend / Mercado Pago).
 */
@Injectable()
export class NotificationsPushService {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionsRepository: Repository<PushSubscription>,
    private readonly configService: ConfigService,
  ) {}

  get enabled(): boolean {
    return Boolean(this.configService.get<boolean>('notifications.pushEnabled'));
  }

  /** La clave pública es justamente pública: el navegador la necesita para suscribirse. */
  getPublicKey(): { enabled: boolean; publicKey: string | null } {
    return {
      enabled: this.enabled,
      publicKey: this.enabled ? (this.configService.get<string>('notifications.vapidPublicKey') ?? null) : null,
    };
  }

  async subscribe(adminId: string, dto: CreatePushSubscriptionDto, userAgent: string | undefined) {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Las notificaciones push no están configuradas en el servidor');
    }
    if (!isAllowedPushEndpoint(dto.endpoint)) {
      throw new BadRequestException('El servicio de notificaciones de este navegador no está soportado');
    }

    const deviceLabel = describeDevice(userAgent);
    const existing = await this.subscriptionsRepository.findOne({ where: { endpoint: dto.endpoint } });
    if (existing) {
      // Mismo navegador que se vuelve a suscribir (o cambió de admin en ese equipo): se
      // reasigna, nunca quedan dos admins recibiendo en el mismo endpoint.
      existing.adminId = adminId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      existing.deviceLabel = deviceLabel;
      existing.failureCount = 0;
      return this.toResponse(await this.subscriptionsRepository.save(existing));
    }

    const count = await this.subscriptionsRepository.count({ where: { adminId } });
    if (count >= MAX_DEVICES_PER_ADMIN) {
      throw new BadRequestException(
        `Ya tenés ${MAX_DEVICES_PER_ADMIN} dispositivos registrados. Eliminá alguno para agregar otro.`,
      );
    }

    try {
      const saved = await this.subscriptionsRepository.save(
        this.subscriptionsRepository.create({
          adminId,
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          deviceLabel,
          failureCount: 0,
          lastUsedAt: null,
        }),
      );
      return this.toResponse(saved);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Dos altas simultáneas del mismo endpoint - la otra ya lo guardó.
      const saved = await this.subscriptionsRepository.findOneOrFail({ where: { endpoint: dto.endpoint } });
      return this.toResponse(saved);
    }
  }

  async listForAdmin(adminId: string) {
    const rows = await this.subscriptionsRepository.find({ where: { adminId }, order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toResponse(row));
  }

  async remove(adminId: string, id: string): Promise<void> {
    const result = await this.subscriptionsRepository.delete({ id, adminId });
    if (!result.affected) throw new NotFoundException('No se encontró el dispositivo');
  }

  /** Baja por endpoint - la usa el propio navegador al desactivar push desde ese equipo. */
  async removeByEndpoint(adminId: string, endpoint: string): Promise<void> {
    await this.subscriptionsRepository.delete({ adminId, endpoint });
  }

  /**
   * Envía a todos los dispositivos del admin. Nunca lanza. Una suscripción que el servicio de
   * push reporta como inexistente (404/410: el usuario revocó el permiso o desinstaló) se borra
   * en el acto; las demás fallas se cuentan y recién se elimina tras varias seguidas.
   */
  async sendToAdmin(adminId: string, payload: PushPayload): Promise<PushSendResult> {
    if (!this.enabled) return { attempted: 0, delivered: 0, lastError: 'Push no configurado' };

    const subscriptions = await this.subscriptionsRepository.find({ where: { adminId } });
    if (subscriptions.length === 0) return { attempted: 0, delivered: 0, lastError: null };

    const vapidDetails = {
      subject: this.configService.get<string>('notifications.vapidSubject')!,
      publicKey: this.configService.get<string>('notifications.vapidPublicKey')!,
      privateKey: this.configService.get<string>('notifications.vapidPrivateKey')!,
    };
    const body = JSON.stringify(payload);
    let delivered = 0;
    let lastError: string | null = null;

    for (const subscription of subscriptions) {
      try {
        await this.transmit(subscription, body, {
          vapidDetails,
          // Un aviso que no pudo entregarse en una hora ya no es "tiempo real" - igual queda en
          // el panel.
          TTL: 3600,
          urgency: payload.critical ? 'high' : 'normal',
        });
        delivered += 1;
        await this.subscriptionsRepository.update({ id: subscription.id }, { failureCount: 0, lastUsedAt: new Date() });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        lastError = `HTTP ${statusCode ?? 's/d'}: ${sanitizeErrorMessage(error)}`;

        if (statusCode === 404 || statusCode === 410) {
          await this.subscriptionsRepository.delete({ id: subscription.id });
          continue;
        }
        const failureCount = subscription.failureCount + 1;
        if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
          await this.subscriptionsRepository.delete({ id: subscription.id });
        } else {
          await this.subscriptionsRepository.update({ id: subscription.id }, { failureCount });
        }
        LoggerHelper(`Falló un envío push (${subscription.deviceLabel}): ${lastError}`, 'NotificationsPushService', true);
      }
    }

    return { attempted: subscriptions.length, delivered, lastError };
  }

  /** Único punto que habla con el servicio de push del navegador (cifrado + firma VAPID vía
   *  `web-push`). Aislado en un método para poder sustituirlo en los tests. */
  protected transmit(
    subscription: PushSubscription,
    body: string,
    options: webpush.RequestOptions,
  ): Promise<unknown> {
    return webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      body,
      options,
    );
  }

  /**
   * Nunca devuelve `endpoint` ni las claves: son credenciales de envío hacia ese dispositivo.
   * `fingerprint` es un hash truncado del endpoint - le permite al navegador reconocer cuál de
   * las filas es "este dispositivo" (calcula el mismo hash de su propia suscripción) sin que el
   * endpoint real salga del servidor.
   */
  private toResponse(subscription: PushSubscription) {
    return {
      id: subscription.id,
      fingerprint: createHash('sha256').update(subscription.endpoint).digest('hex').slice(0, 16),
      deviceLabel: subscription.deviceLabel,
      createdAt: subscription.createdAt,
      lastUsedAt: subscription.lastUsedAt,
    };
  }
}
