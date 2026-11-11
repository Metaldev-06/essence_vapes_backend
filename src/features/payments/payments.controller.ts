import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '../../common/enums/system-role.enum';
import { UserAwareThrottlerGuard } from '../../common/guards/user-aware-throttler.guard';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@Auth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Tope bajo y por-usuario a propósito: cada intento golpea la Orders API real y un límite
   *  laxo facilitaría "probar" tarjetas robadas contra este endpoint (card testing fraud). */
  @Post()
  @UseGuards(UserAwareThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  process(
    @GetUser('id') userId: string,
    @Body() dto: ProcessPaymentDto,
    @Headers('x-meli-session-id') deviceId?: string,
  ) {
    return this.paymentsService.processPayment(userId, dto, deviceId);
  }

  /** Panel admin "Ventas/Pedidos" - historial de intentos (incluye los id de Mercado Pago). */
  @Get('admin/orders/:orderId/attempts')
  @Auth(Role.ADMIN)
  getAttemptsForOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.getAttemptsForOrder(orderId);
  }

  /** Panel admin "Transacciones" (ver tarea, punto 6) - sección independiente de "Pedidos". */
  @Get('admin/transactions')
  @Auth(Role.ADMIN)
  findAllForAdmin(@Query() query: QueryTransactionsDto) {
    return this.paymentsService.findAllForAdmin(query);
  }
}
