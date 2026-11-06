import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { WithdrawalStatus } from '../enums/withdrawal-status.enum';

export class UpdateWithdrawalStatusDto {
  @IsEnum(WithdrawalStatus)
  status!: WithdrawalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}
