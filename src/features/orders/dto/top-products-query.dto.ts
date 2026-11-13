import { Type } from 'class-transformer';
import { IsIn, IsOptional, Max, Min } from 'class-validator';

import { SalesReportFiltersDto } from './sales-report-filters.dto';

const SORT_BY_VALUES = ['revenue', 'units'] as const;
const DIRECTIONS = ['top', 'bottom'] as const;

export class TopProductsQueryDto extends SalesReportFiltersDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsIn(SORT_BY_VALUES)
  sortBy?: (typeof SORT_BY_VALUES)[number] = 'revenue';

  /** 'top' = más vendidos (default), 'bottom' = menos vendidos (ver tarea, punto 4.1: "productos
   *  menos vendidos"). */
  @IsOptional()
  @IsIn(DIRECTIONS)
  direction?: (typeof DIRECTIONS)[number] = 'top';
}
