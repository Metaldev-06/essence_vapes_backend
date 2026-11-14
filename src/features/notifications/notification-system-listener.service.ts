import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { Subscription } from 'rxjs';

import { EmailService } from '../../common/services/email/email.service';
import { emailFailedEvent } from './notification-events';
import { NotificationsService } from './notifications.service';

/**
 * Convierte fallas de infraestructura en notificaciones de sistema. `EmailService` vive en
 * `common/` y no conoce este módulo: solo expone `failures$`, y acá se escucha - así la
 * dependencia va en una sola dirección (notificaciones -> email), sin ciclo.
 *
 * Los correos del propio sistema de notificaciones van marcados `internal` y `EmailService` no
 * los reporta, así que no existe el loop "falló el aviso de que falló un correo". El evento se
 * deduplica por hora: una caída de Resend genera un aviso, no uno por cada correo perdido.
 */
@Injectable()
export class NotificationSystemListener implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription | undefined;

  constructor(
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.emailService.failures$.subscribe((failure) => {
      void this.notificationsService.publish(emailFailedEvent(failure.subject));
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
