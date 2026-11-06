import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

import { SortOrder } from '../../../common/enums/sort-order.enum';
import { WithdrawalStatus } from '../enums/withdrawal-status.enum';

/** Whitelist de columnas ordenables - sin esto, un valor arbitrario llega a `paginationService.paginate` y TypeORM tira un `EntityPropertyNotFoundError` sin manejar. */
const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'status', 'trackingCode', 'buyerName'] as const;

export class QueryWithdrawalRequestsDto {
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
  @IsString()
  @IsIn([SortOrder.ASC, SortOrder.DESC])
  order?: SortOrder.ASC | SortOrder.DESC = SortOrder.DESC;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sort?: string = 'createdAt';

  @IsOptional()
  @IsEnum(WithdrawalStatus)
  status?: WithdrawalStatus;
}
