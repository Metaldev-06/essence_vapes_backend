import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { Role } from '../../common/enums/system-role.enum';
import { UserAwareThrottlerGuard } from '../../common/guards/user-aware-throttler.guard';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ExportTopProductsQueryDto } from './dto/export-top-products-query.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { buildTopProductsPdf, buildTopProductsXlsx } from './helpers/products-export.helper';
import { SalesReportFiltersDto } from './dto/sales-report-filters.dto';
import { SalesSummaryQueryDto } from './dto/sales-summary-query.dto';
import { SalesTimeseriesQueryDto } from './dto/sales-timeseries-query.dto';
import { TopProductsQueryDto } from './dto/top-products-query.dto';
import { UpdateLogisticsStatusDto } from './dto/update-logistics-status.dto';
import { UpdateOrderNotesDto } from './dto/update-order-notes.dto';
import { OrdersService, type SalesReportFilters } from './orders.service';

/** Extrae los filtros opcionales comunes (ver `SalesReportFiltersDto`) de cualquiera de los DTOs
 *  de reportes que lo extienden, descartando `from`/`to`/campos propios de cada endpoint. */
const extractReportFilters = (dto: SalesReportFiltersDto): SalesReportFilters => ({
  category: dto.category,
  brand: dto.brand,
  productId: dto.productId,
  variantId: dto.variantId,
  orderStatus: dto.orderStatus,
  paymentStatus: dto.paymentStatus,
  deliveryMethod: dto.deliveryMethod,
  paymentMethodType: dto.paymentMethodType,
  buyer: dto.buyer,
});

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

  @Get('admin/sales-summary')
  @Auth(Role.ADMIN)
  getSalesSummary(@Query() query: SalesSummaryQueryDto) {
    return this.ordersService.getSalesSummaryWithComparison(
      new Date(query.from),
      new Date(query.to),
      new Date(query.previousFrom),
      new Date(query.previousTo),
      extractReportFilters(query),
    );
  }

  @Get('admin/sales-timeseries')
  @Auth(Role.ADMIN)
  getSalesTimeseries(@Query() query: SalesTimeseriesQueryDto) {
    return this.ordersService.getSalesTimeseries(
      new Date(query.from),
      new Date(query.to),
      query.granularity,
      extractReportFilters(query),
    );
  }

  @Get('admin/sales-by-category')
  @Auth(Role.ADMIN)
  getSalesByCategory(@Query() query: SalesReportFiltersDto) {
    return this.ordersService.getSalesByCategory(
      new Date(query.from),
      new Date(query.to),
      extractReportFilters(query),
    );
  }

  @Get('admin/top-products')
  @Auth(Role.ADMIN)
  getTopProducts(@Query() query: TopProductsQueryDto) {
    return this.ordersService.getTopProducts(
      new Date(query.from),
      new Date(query.to),
      query.limit ?? 10,
      query.sortBy ?? 'revenue',
      query.direction ?? 'top',
      extractReportFilters(query),
    );
  }

  /** Exportación a Excel/PDF de la tabla de productos del reporte (ver tarea, punto 4.4) -
   *  respeta los mismos filtros que `admin/top-products`, nunca un dataset aparte. */
  @Get('admin/top-products/export')
  @Auth(Role.ADMIN)
  async exportTopProducts(@Query() query: ExportTopProductsQueryDto): Promise<StreamableFile> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const rows = await this.ordersService.getTopProducts(
      from,
      to,
      query.limit ?? 50,
      query.sortBy ?? 'revenue',
      query.direction ?? 'top',
      extractReportFilters(query),
    );

    const meta = {
      generatedAt: new Date(),
      periodLabel: `${query.from} a ${query.to}`,
      fromUtc: query.from,
      toUtc: query.to,
    };

    const filenameBase = `productos_${query.from.slice(0, 10)}_${query.to.slice(0, 10)}`;
    if (query.format === 'xlsx') {
      const buffer = buildTopProductsXlsx(rows, meta);
      return new StreamableFile(buffer, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: `attachment; filename="${filenameBase}.xlsx"`,
      });
    }
    const buffer = await buildTopProductsPdf(rows, meta);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filenameBase}.pdf"`,
    });
  }

  @Get('admin/:id')
  @Auth(Role.ADMIN)
  findOneForAdmin(@Param('id') id: string) {
    return this.ordersService.findOneForAdmin(id);
  }

  @Patch('admin/:id/logistics-status')
  @Auth(Role.ADMIN)
  updateLogisticsStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLogisticsStatusDto,
    @GetUser('id') adminId: string,
    @GetUser('email') adminEmail: string,
  ) {
    return this.ordersService.updateLogisticsStatus(id, dto, { id: adminId, email: adminEmail });
  }

  @Get('admin/:id/audit-log')
  @Auth(Role.ADMIN)
  getAuditLog(@Param('id') id: string) {
    return this.ordersService.getAuditLogForOrder(id);
  }

  @Patch('admin/:id/notes')
  @Auth(Role.ADMIN)
  updateInternalNotes(
    @Param('id') id: string,
    @Body() dto: UpdateOrderNotesDto,
    @GetUser('id') adminId: string,
    @GetUser('email') adminEmail: string,
  ) {
    return this.ordersService.updateInternalNotes(id, dto.notes, { id: adminId, email: adminEmail });
  }
}
