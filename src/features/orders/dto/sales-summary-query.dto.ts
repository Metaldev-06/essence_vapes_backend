import { IsDateString } from 'class-validator';

import { SalesReportFiltersDto } from './sales-report-filters.dto';

/** `previousFrom`/`previousTo` vienen del propio `DateRangeSelection` del frontend
 *  (`previousFromUtc`/`previousToUtc`) - el backend nunca inventa el período de comparación. */
export class SalesSummaryQueryDto extends SalesReportFiltersDto {
  @IsDateString()
  previousFrom!: string;

  @IsDateString()
  previousTo!: string;
}
