import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LegalInfoResponse {
  businessName: string;
  legalName: string;
  cuit: string;
  address: string;
  province: string;
  locality: string;
  supportEmail: string;
  whatsapp: string;
  businessHours: string;
  vapesSaleEnforcementEnabled: boolean;
}

@Injectable()
export class LegalInfoService {
  constructor(private readonly configService: ConfigService) {}

  /** Single source of truth for every legal/business datum shown across the storefront. */
  getInfo(): LegalInfoResponse {
    return {
      businessName: this.configService.get<string>('legal.businessName')!,
      legalName: this.configService.get<string>('legal.legalName')!,
      cuit: this.configService.get<string>('legal.cuit')!,
      address: this.configService.get<string>('legal.address')!,
      province: this.configService.get<string>('legal.province')!,
      locality: this.configService.get<string>('legal.locality')!,
      supportEmail: this.configService.get<string>('legal.supportEmail')!,
      whatsapp: this.configService.get<string>('legal.whatsapp')!,
      businessHours: this.configService.get<string>('legal.businessHours')!,
      vapesSaleEnforcementEnabled: this.configService.get<boolean>(
        'legal.vapesSaleEnforcementEnabled',
      )!,
    };
  }
}
