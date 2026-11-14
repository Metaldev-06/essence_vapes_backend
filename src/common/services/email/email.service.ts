import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Resend } from 'resend';
import { Observable, Subject } from 'rxjs';

import { LoggerHelper } from '../../helpers/logger.helper';

export interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  /** `true` para los correos del propio sistema de notificaciones: si fallan no se reporta por
   *  `failures$` (evita el loop "falló el aviso de que falló un email"). */
  internal?: boolean;
}

export interface EmailFailure {
  readonly subject: string;
  readonly reason: string;
}

export interface EmailAddresses {
  noReply: string;
  contact: string;
  sales: string;
  support: string;
  supportInbox: string;
  contactInbox: string;
}

/**
 * Envío real de emails vía Resend. Si `RESEND_API_KEY` no está configurada, ningún flujo que
 * dependa de esto rompe - se loguea y se sigue (mismo criterio que el resto de las
 * integraciones opcionales del proyecto, ver `fragrance-ai.service.ts`).
 */
@Injectable()
export class EmailService {
  private readonly resend: Resend | null;
  private readonly failures = new Subject<EmailFailure>();

  /**
   * Emite cada vez que Resend rechaza o no logra enviar un correo (NO cuando falta
   * `RESEND_API_KEY` - eso es configuración ausente, no una falla). Lo consume el módulo de
   * notificaciones para avisarle al admin; este servicio no sabe nada de ese módulo.
   */
  readonly failures$: Observable<EmailFailure> = this.failures.asObservable();

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resend.apiKey');
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  get addresses(): EmailAddresses {
    return {
      noReply: this.configService.get<string>('resend.fromNoReply')!,
      contact: this.configService.get<string>('resend.fromContact')!,
      sales: this.configService.get<string>('resend.fromSales')!,
      support: this.configService.get<string>('resend.fromSupport')!,
      supportInbox: this.configService.get<string>('resend.supportInboxEmail')!,
      contactInbox: this.configService.get<string>('resend.contactInboxEmail')!,
    };
  }

  /** Nunca lanza - un email que no sale no debe tirar abajo el request que lo disparó. */
  async send(options: SendEmailOptions): Promise<boolean> {
    if (!this.resend) {
      LoggerHelper(
        `RESEND_API_KEY no está configurada - no se envió el email "${options.subject}" a ${
          Array.isArray(options.to) ? options.to.join(', ') : options.to
        }`,
        'EmailService',
      );
      return false;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      });

      if (error) {
        LoggerHelper(`Resend rechazó el email "${options.subject}": ${error.message}`, 'EmailService', true);
        this.reportFailure(options, error.message);
        return false;
      }
      return true;
    } catch (err) {
      LoggerHelper(
        `Error enviando email "${options.subject}": ${err instanceof Error ? err.message : String(err)}`,
        'EmailService',
        true,
      );
      this.reportFailure(options, err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  private reportFailure(options: SendEmailOptions, reason: string): void {
    if (options.internal) return;
    this.failures.next({ subject: options.subject, reason });
  }
}
