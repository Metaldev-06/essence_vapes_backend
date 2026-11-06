import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

/** Formulario de contacto público - sin login, con límite básico anti-abuso. */
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  async create(@Body() dto: CreateContactMessageDto): Promise<void> {
    await this.contactService.send(dto);
  }
}
