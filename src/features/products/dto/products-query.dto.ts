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
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { SortOrder } from '../../../common/enums/sort-order.enum';
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
  'stock',
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
  @MaxLength(100)
  term?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'accent debe ser un color hexadecimal válido (ej: #8b5cf6)',
  })
  accent?: string;

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
