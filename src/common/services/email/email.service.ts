import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Resend } from 'resend';

import { LoggerHelper } from '../../helpers/logger.helper';

export interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
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
        return false;
      }
      return true;
    } catch (err) {
      LoggerHelper(
        `Error enviando email "${options.subject}": ${err instanceof Error ? err.message : String(err)}`,
        'EmailService',
        true,
      );
      return false;
    }
  }
}
