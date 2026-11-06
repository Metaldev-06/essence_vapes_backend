import { Module } from '@nestjs/common';

import { LegalInfoController } from './legal-info.controller';
import { LegalInfoService } from './legal-info.service';

@Module({
  controllers: [LegalInfoController],
  providers: [LegalInfoService],
})
export class LegalInfoModule {}
