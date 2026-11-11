import { Controller, Get, Param, Post, Body, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '../../common/enums/system-role.enum';
import { UserAwareThrottlerGuard } from '../../common/guards/user-aware-throttler.guard';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@Auth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(UserAwareThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@GetUser('id') userId: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.createFromCart(userId, dto);
  }

  @Get('mine')
  findMine(@GetUser('id') userId: string, @Query() query: QueryOrdersDto) {
    return this.ordersService.findMine(userId, query);
  }

  @Get('mine/:id')
  findOneMine(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.ordersService.findOneMine(userId, id);
  }

  @Get('admin')
  @Auth(Role.ADMIN)
  findAllForAdmin(@Query() query: QueryOrdersDto) {
    return this.ordersService.findAllForAdmin(query);
  }

  @Get('admin/stats')
  @Auth(Role.ADMIN)
  getStats() {
    return this.ordersService.getStats();
  }

  @Get('admin/:id')
  @Auth(Role.ADMIN)
  findOneForAdmin(@Param('id') id: string) {
    return this.ordersService.findOneForAdmin(id);
  }
}
