import { IsIn } from 'class-validator';

import { SalesReportFiltersDto } from './sales-report-filters.dto';

const GRANULARITIES = ['day', 'week', 'month'] as const;

export class SalesTimeseriesQueryDto extends SalesReportFiltersDto {
  @IsIn(GRANULARITIES)
  granularity!: (typeof GRANULARITIES)[number];
}
