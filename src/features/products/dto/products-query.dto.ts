import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { SortOrder } from '../../../common/enums/sort-order.enum';
import { AccentKey } from '../enums/accent-key.enum';
import { Gender } from '../enums/gender.enum';
import { ProductCategory } from '../enums/product-category.enum';
import { ScentStyle } from '../enums/scent-style.enum';

const SORTABLE_FIELDS = [
  'name',
  'brand',
  'priceValue',
  'rating',
  'year',
  'createdAt',
  'featured',
] as const;

export class ProductsQueryDto {
  @IsOptional()
  @IsPositive()
  @Type(() => Number)
  @Max(100)
  limit?: number = 12;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.ASC;

  @IsOptional()
  @IsIn(SORTABLE_FIELDS)
  sort?: (typeof SORTABLE_FIELDS)[number] = 'createdAt';

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsEnum(AccentKey)
  accent?: AccentKey;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @IsEnum(ScentStyle, { each: true })
  styles?: ScentStyle[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;
}
