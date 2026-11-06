import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '../../common/enums/system-role.enum';
import { UserAwareThrottlerGuard } from '../../common/guards/user-aware-throttler.guard';
import { Auth } from '../auth/decorators/auth.decorator';
import { CreateWithdrawalRequestDto } from './dto/create-withdrawal-request.dto';
import { LookupWithdrawalRequestDto } from './dto/lookup-withdrawal-request.dto';
import { QueryWithdrawalRequestsDto } from './dto/query-withdrawal-requests.dto';
import { UpdateWithdrawalStatusDto } from './dto/update-withdrawal-status.dto';
import { WithdrawalRequestsService } from './withdrawal-requests.service';

/**
 * "Botón de arrepentimiento" (Disposición 954/2025): debe funcionar sin cuenta ni login, por
 * eso `create`/`lookup` son públicas; solo la gestión administrativa exige @Auth(Role.ADMIN).
 */
@Controller('withdrawal-requests')
export class WithdrawalRequestsController {
  constructor(private readonly withdrawalRequestsService: WithdrawalRequestsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  create(@Body() dto: CreateWithdrawalRequestDto) {
    return this.withdrawalRequestsService.create(dto);
  }

  @Get('lookup')
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  lookup(@Query() dto: LookupWithdrawalRequestDto) {
    return this.withdrawalRequestsService.lookup(dto);
  }

  @Get()
  @Auth(Role.ADMIN)
  findAllForAdmin(@Query() query: QueryWithdrawalRequestsDto) {
    return this.withdrawalRequestsService.findAllForAdmin(query);
  }

  /** Modificación administrativa - 30/min por admin (no por IP), ver `UserAwareThrottlerGuard`. */
  @Patch(':id/status')
  @Auth(Role.ADMIN)
  @UseGuards(UserAwareThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateWithdrawalStatusDto) {
    return this.withdrawalRequestsService.updateStatus(id, dto);
  }
}
