import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SortOrder } from '../enums/sort-order.enum';

export class PaginationDto {
  @IsOptional()
  @IsPositive()
  @Type(() => Number)
  @Max(50)
  @Min(0)
  limit?: number = 10;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  @IsIn([SortOrder.ASC, SortOrder.DESC])
  order?: SortOrder.ASC | SortOrder.DESC = SortOrder.ASC;

  @IsOptional()
  @IsString()
  sort?: string = 'id';

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsString()
  category: string | undefined;

  @IsOptional()
  @IsString()
  subCategory: string | undefined;

  @IsOptional()
  @IsString()
  brand: string | undefined;

  @IsOptional()
  @IsString()
  country: string | undefined;
}
