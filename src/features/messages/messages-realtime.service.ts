import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

import { InboxAddress } from './enums/inbox-address.enum';

export type MessageRealtimeEvent =
  | { type: 'thread.new_email'; inbox: InboxAddress; threadId: string }
  | { type: 'thread.updated'; inbox: InboxAddress; threadId: string };

/**
 * Bus de eventos en memoria para notificar al panel en tiempo real - un solo `Subject`
 * multicast, consumido por `GET /messages/events` (Server-Sent Events). Deliberadamente NO usa
 * WebSockets/Redis: el deploy es un único proceso Node sin clustering (igual criterio que el
 * resto de la seguridad del proyecto, ver [[project_overview]]/BACKEND_SECURITY.md), así que un
 * `Subject` in-process le llega a toda conexión SSE abierta sin infra extra. Si el backend algún
 * día pasa a multi-instancia, esto necesitaría un backplane (Redis pub/sub) - no antes.
 */
@Injectable()
export class MessagesRealtimeService {
  private readonly events = new Subject<MessageRealtimeEvent>();

  readonly events$ = this.events.asObservable();

  emit(event: MessageRealtimeEvent): void {
    this.events.next(event);
  }
}
