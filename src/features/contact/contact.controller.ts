import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';

import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { SimpleRateLimitGuard } from '../../common/guards/simple-rate-limit.guard';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

/** Formulario de contacto público - sin login, con límite básico anti-abuso. */
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SimpleRateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  async create(@Body() dto: CreateContactMessageDto): Promise<void> {
    await this.contactService.send(dto);
  }
}
