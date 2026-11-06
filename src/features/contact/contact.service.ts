import { Injectable } from '@nestjs/common';

import { escapeHtml } from '../../common/helpers/escape-html.helper';
import { EmailService } from '../../common/services/email/email.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

const REASON_LABELS: Record<string, string> = {
  'consulta-general': 'Consulta general',
  'estado-pedido': 'Estado de un pedido',
  'cambios-devoluciones': 'Cambios y devoluciones',
  'trabaja-con-nosotros': 'Trabajá con nosotros',
};

@Injectable()
export class ContactService {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Envía dos emails reales (nunca lanza si Resend no está configurado o falla - el usuario ya
   * ve la confirmación en pantalla, perder el email no debe romper el request):
   * 1. Notificación interna al buzón de contacto, con `replyTo` apuntando al email del cliente.
   * 2. Confirmación automática al cliente, para que sepa que el mensaje llegó.
   */
  async send(dto: CreateContactMessageDto): Promise<void> {
    const { contact, contactInbox } = this.emailService.addresses;
    const reasonLabel = REASON_LABELS[dto.reason] ?? dto.reason;

    await this.emailService.send({
      from: contact,
      to: contactInbox,
      replyTo: dto.email,
      subject: `Nuevo mensaje de contacto: ${reasonLabel}`,
      html: this.buildInternalNotificationHtml(dto, reasonLabel),
    });

    await this.emailService.send({
      from: contact,
      to: dto.email,
      subject: 'Recibimos tu mensaje - Essence Vapes',
      html: this.buildCustomerConfirmationHtml(dto),
    });
  }

  private buildInternalNotificationHtml(dto: CreateContactMessageDto, reasonLabel: string): string {
    return `
      <h2>Nuevo mensaje de contacto</h2>
      <p><strong>Motivo:</strong> ${escapeHtml(reasonLabel)}</p>
      <p><strong>Nombre:</strong> ${escapeHtml(dto.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(dto.email)}</p>
      ${dto.phone ? `<p><strong>Teléfono:</strong> ${escapeHtml(dto.phone)}</p>` : ''}
      <p><strong>Mensaje:</strong></p>
      <p>${escapeHtml(dto.message).replace(/\n/g, '<br>')}</p>
    `;
  }

  private buildCustomerConfirmationHtml(dto: CreateContactMessageDto): string {
    return `
      <h2>¡Hola ${escapeHtml(dto.name)}!</h2>
      <p>Recibimos tu mensaje y te vamos a responder a la brevedad a este mismo email.</p>
      <p><strong>Tu mensaje:</strong></p>
      <p>${escapeHtml(dto.message).replace(/\n/g, '<br>')}</p>
      <p>Gracias por escribirnos.<br>Essence Vapes</p>
    `;
  }
}
