import { IsIn } from 'class-validator';

import { TopProductsQueryDto } from './top-products-query.dto';

const FORMATS = ['xlsx', 'pdf'] as const;

export class ExportTopProductsQueryDto extends TopProductsQueryDto {
  @IsIn(FORMATS)
  format!: (typeof FORMATS)[number];
}
