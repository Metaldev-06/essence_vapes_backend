import { IsEnum } from 'class-validator';

import { LogisticsStatus } from '../enums/logistics-status.enum';

export class UpdateLogisticsStatusDto {
  @IsEnum(LogisticsStatus)
  logisticsStatus!: LogisticsStatus;
}
