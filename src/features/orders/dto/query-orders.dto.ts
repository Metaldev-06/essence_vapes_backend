import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

import { SortOrder } from '../../../common/enums/sort-order.enum';
import { DeliveryMethod } from '../enums/delivery-method.enum';
import { LogisticsStatus } from '../enums/logistics-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'totalValue', 'status', 'paymentStatus'] as const;

export class QueryOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsIn([SortOrder.ASC, SortOrder.DESC])
  order?: SortOrder.ASC | SortOrder.DESC = SortOrder.DESC;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sort?: string = 'createdAt';

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @IsOptional()
  @IsEnum(LogisticsStatus)
  logisticsStatus?: LogisticsStatus;

  /** Búsqueda exacta por email del comprador (snapshot, no join contra `User`). */
  @IsOptional()
  @IsString()
  buyerEmail?: string;

  /** Panel admin: busca por id de orden (prefijo), nombre o email del comprador - OR entre los
   *  tres, sin distinguir mayúsculas/minúsculas. Distinto de `buyerEmail` (match exacto). */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /** Importe mínimo/máximo del pedido (ver tarea, punto 7.2) - en pesos, igual que `totalValue`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maxAmount?: number;

  /** Filtra por el medio de pago del intento APROBADO del pedido (join contra
   *  `payment_attempts` - el pedido en sí no tiene esta columna). */
  @IsOptional()
  @IsIn(['credit_card', 'debit_card'])
  paymentMethodType?: 'credit_card' | 'debit_card';
}
