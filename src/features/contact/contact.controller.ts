import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { LimitedForm } from '../security/entities/form-submission.entity';
import { FormSubmissionLimitService } from '../security/form-submission-limit.service';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

/**
 * Formulario de contacto público - sin login. Dos límites anti-abuso: el de ráfaga (5 cada 10
 * minutos, `@Throttle`) y un tope de 2 mensajes cada 24 horas por visitante
 * (`FormSubmissionLimitService`, que solo cuenta los mensajes que realmente se enviaron).
 */
@Controller('contact')
export class ContactController {
  constructor(
    private readonly contactService: ContactService,
    private readonly submissionLimit: FormSubmissionLimitService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  async create(@Body() dto: CreateContactMessageDto, @Ip() ip: string): Promise<void> {
    await this.submissionLimit.assertCanSubmit(LimitedForm.CONTACT, ip);
    await this.contactService.send(dto);
    await this.submissionLimit.recordSubmission(LimitedForm.CONTACT, ip);
  }
}
