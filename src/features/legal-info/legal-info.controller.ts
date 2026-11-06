import { Controller, Get } from '@nestjs/common';

import { LegalInfoService } from './legal-info.service';

/** Público: datos de identificación del vendedor consumidos por el footer y las páginas legales. */
@Controller('legal')
export class LegalInfoController {
  constructor(private readonly legalInfoService: LegalInfoService) {}

  @Get('info')
  getInfo() {
    return this.legalInfoService.getInfo();
  }
}
