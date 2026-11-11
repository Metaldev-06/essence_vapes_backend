import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

import { SortOrder } from '../../../common/enums/sort-order.enum';
import { PaymentStatus } from '../../orders/enums/payment-status.enum';

const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'amountValue', 'status'] as const;

/** Filtros del punto 6 de la tarea: Fecha, Cliente, Pedido, Estado, Medio de pago. */
export class QueryTransactionsDto {
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
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsIn(['credit_card', 'debit_card'])
  paymentMethodType?: 'credit_card' | 'debit_card';

  @IsOptional()
  @IsString()
  orderId?: string;

  /** Texto libre contra nombre o email del comprador de la orden asociada. */
  @IsOptional()
  @IsString()
  buyer?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
