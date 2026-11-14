import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Sse,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Observable, concat, interval, map, merge, of, takeUntil, timer } from 'rxjs';

import { Role } from '../../common/enums/system-role.enum';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { BulkNotificationsDto } from './dto/bulk-notifications.dto';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { SetStockThresholdDto } from './dto/stock-threshold.dto';
import { UpdateGlobalSettingsDto } from './dto/update-global-settings.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { readBearerExpiryMs } from './helpers/jwt-expiry.helper';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsPushService } from './notifications-push.service';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationsService } from './notifications.service';
import { StockAlertService } from './stock-alert.service';

/** Los proxies (Traefik) cortan conexiones ociosas - un latido periódico mantiene vivo el stream
 *  y le permite al cliente detectar una conexión muerta si deja de recibirlo. */
const HEARTBEAT_MS = 25_000;

/**
 * Centro de notificaciones del panel - todo admin-only y todo acotado al admin autenticado:
 * el destinatario SIEMPRE sale del JWT (`@GetUser('id')`), nunca de un parámetro del request.
 */
@Controller('notifications')
@Auth(Role.ADMIN)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: NotificationSettingsService,
    private readonly realtime: NotificationsRealtimeService,
    private readonly pushService: NotificationsPushService,
    private readonly stockAlertService: StockAlertService,
  ) {}

  @Get()
  findAll(@GetUser('id') adminId: string, @Query() query: QueryNotificationsDto) {
    return this.notificationsService.findForAdmin(adminId, query);
  }

  @Get('unread-count')
  async unreadCount(@GetUser('id') adminId: string) {
    return { unreadCount: await this.notificationsService.countUnread(adminId) };
  }

  /**
   * Server-Sent Events del admin autenticado. El primer evento (`ready`) le confirma al cliente
   * que el stream quedó abierto - recién ahí resincroniza por REST lo que se haya perdido
   * mientras estuvo desconectado. El stream se corta solo cuando vence el JWT con el que se
   * abrió: el cliente reconecta con el token vigente (o deja de intentar si la sesión terminó),
   * así una sesión vencida o revocada no sigue recibiendo eventos indefinidamente.
   */
  @Sse('stream')
  stream(
    @GetUser('id') adminId: string,
    @Headers('authorization') authorization: string | undefined,
  ): Observable<{ data: string }> {
    const events$ = merge(
      this.realtime.streamFor(adminId),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'ping' as const }))),
    );
    const stream$ = concat(of({ type: 'ready' as const }), events$).pipe(
      map((event) => ({ data: JSON.stringify(event) })),
    );

    const expiresAtMs = readBearerExpiryMs(authorization);
    return expiresAtMs ? stream$.pipe(takeUntil(timer(new Date(expiresAtMs)))) : stream$;
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@GetUser('id') adminId: string) {
    return this.notificationsService.markAllRead(adminId);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  bulk(@GetUser('id') adminId: string, @Body() dto: BulkNotificationsDto) {
    return this.notificationsService.bulk(adminId, dto.ids, dto.action);
  }

  @Get('preferences')
  getPreferences(@GetUser('id') adminId: string) {
    return this.settingsService.getView(adminId);
  }

  @Put('preferences')
  updatePreferences(@GetUser('id') adminId: string, @Body() dto: UpdatePreferencesDto) {
    return this.settingsService.updatePreferences(adminId, dto);
  }

  @Put('settings')
  async updateGlobalSettings(@Body() dto: UpdateGlobalSettingsDto) {
    return this.settingsService.toGlobalView(await this.settingsService.updateGlobal(dto));
  }

  // --- Umbrales de stock propios por producto/variante ---

  @Get('stock-thresholds')
  listStockThresholds() {
    return this.stockAlertService.listThresholds();
  }

  @Put('stock-thresholds')
  setStockThreshold(@Body() dto: SetStockThresholdDto) {
    return this.stockAlertService.setThreshold(dto.productId, dto.variantId ?? 'base', dto.threshold);
  }

  /** Quita el umbral propio: el producto vuelve a usar el global. */
  @Delete('stock-thresholds')
  removeStockThreshold(@Query('productId') productId: string, @Query('variantId') variantId?: string) {
    return this.stockAlertService.setThreshold(String(productId ?? ''), variantId || 'base', null);
  }

  // --- Web Push: dispositivos del admin autenticado ---

  @Get('push/public-key')
  getPushPublicKey() {
    return this.pushService.getPublicKey();
  }

  @Get('push/subscriptions')
  listPushSubscriptions(@GetUser('id') adminId: string) {
    return this.pushService.listForAdmin(adminId);
  }

  @Post('push/subscriptions')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribePush(
    @GetUser('id') adminId: string,
    @Body() dto: CreatePushSubscriptionDto,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.pushService.subscribe(adminId, dto, userAgent);
  }

  @Delete('push/subscriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePushSubscription(@GetUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.pushService.remove(adminId, id);
  }

  /** Envía un push de prueba SOLO a los dispositivos de quien lo pide. */
  @Post('push/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async testPush(@GetUser('id') adminId: string) {
    const result = await this.pushService.sendToAdmin(adminId, {
      title: 'Notificación de prueba',
      body: 'Las notificaciones push de Essence Vapes funcionan en este dispositivo.',
      url: '/admin/notificaciones/configuracion',
      tag: 'test-push',
      critical: false,
    });
    return { attempted: result.attempted, delivered: result.delivered };
  }

  @Patch(':id/read')
  markRead(@GetUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.setRead(adminId, id, true);
  }

  @Patch(':id/unread')
  markUnread(@GetUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.setRead(adminId, id, false);
  }

  @Patch(':id/archive')
  archive(@GetUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.setArchived(adminId, id, true);
  }

  @Patch(':id/unarchive')
  unarchive(@GetUser('id') adminId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.setArchived(adminId, id, false);
  }
}
