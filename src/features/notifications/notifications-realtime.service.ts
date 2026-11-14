import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';

import type { NotificationResponse } from './mappers/notification-response.mapper';

export type NotificationRealtimeEvent =
  /** Una notificación nueva para este admin, con su contador ya actualizado. */
  | { type: 'notification.created'; notification: NotificationResponse; unreadCount: number }
  /** Cambió el estado leído/archivado (desde esta u otra pestaña/dispositivo del mismo admin) -
   *  el cliente refresca lo que tenga en pantalla y usa el contador que viene acá. */
  | { type: 'notifications.changed'; unreadCount: number };

interface Envelope {
  readonly recipientId: string;
  readonly event: NotificationRealtimeEvent;
}

/**
 * Bus en memoria por destinatario para el stream SSE del panel - mismo criterio que
 * `MessagesRealtimeService`: el deploy es un único proceso Node, así que un `Subject` in-process
 * alcanza a toda conexión abierta sin Redis ni WebSockets. A diferencia de aquel, cada evento
 * lleva `recipientId` y `streamFor` filtra por él: un admin jamás recibe por el canal en tiempo
 * real una notificación de otro.
 *
 * Es solo un acelerador: la fuente de verdad es la tabla. Si una conexión se cae y se pierde un
 * evento, el cliente lo recupera al reconectar con `GET /notifications?since=`.
 */
@Injectable()
export class NotificationsRealtimeService {
  private readonly events = new Subject<Envelope>();

  emit(recipientId: string, event: NotificationRealtimeEvent): void {
    this.events.next({ recipientId, event });
  }

  streamFor(recipientId: string): Observable<NotificationRealtimeEvent> {
    return this.events.pipe(
      filter((envelope) => envelope.recipientId === recipientId),
      map((envelope) => envelope.event),
    );
  }
}
