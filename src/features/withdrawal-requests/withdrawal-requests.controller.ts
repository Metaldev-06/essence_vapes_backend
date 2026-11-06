import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Role } from '../../common/enums/system-role.enum';
import { SimpleRateLimitGuard } from '../../common/guards/simple-rate-limit.guard';
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
  @UseGuards(SimpleRateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 5 })
  create(@Body() dto: CreateWithdrawalRequestDto) {
    return this.withdrawalRequestsService.create(dto);
  }

  @Get('lookup')
  @UseGuards(SimpleRateLimitGuard)
  @RateLimit({ windowMs: 15 * 60 * 1000, max: 20 })
  lookup(@Query() dto: LookupWithdrawalRequestDto) {
    return this.withdrawalRequestsService.lookup(dto);
  }

  @Get()
  @Auth(Role.ADMIN)
  findAllForAdmin(@Query() query: QueryWithdrawalRequestsDto) {
    return this.withdrawalRequestsService.findAllForAdmin(query);
  }

  @Patch(':id/status')
  @Auth(Role.ADMIN)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateWithdrawalStatusDto) {
    return this.withdrawalRequestsService.updateStatus(id, dto);
  }
}
