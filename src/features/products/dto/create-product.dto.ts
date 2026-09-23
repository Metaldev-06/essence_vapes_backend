import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { AccentKey } from '../enums/accent-key.enum';
import { Gender } from '../enums/gender.enum';
import { Longevity } from '../enums/longevity.enum';
import { ProductCategory } from '../enums/product-category.enum';
import { ScentStyle } from '../enums/scent-style.enum';
import { Sillage } from '../enums/sillage.enum';
import { DayUsageDto } from './day-usage.dto';
import { FragranceNotesDto } from './fragrance-notes.dto';
import { OccasionRatingsDto } from './occasion-ratings.dto';
import { SeasonUsageDto } from './season-usage.dto';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'id must be a lowercase slug (letters, numbers and dashes only)',
  })
  id?: string;

  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  subtitle!: string;

  @IsArray()
  @IsString({ each: true })
  notes!: string[];

  @IsInt()
  @IsPositive()
  priceValue!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  oldPriceValue?: number;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsEnum(AccentKey)
  accent!: AccentKey;

  @IsEnum(ProductCategory)
  category!: ProductCategory;

  @IsArray()
  @IsEnum(ScentStyle, { each: true })
  styles!: ScentStyle[];

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  ratingCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accords?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FragranceNotesDto)
  fragranceNotes?: FragranceNotesDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mood?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SeasonUsageDto)
  seasonUsage?: SeasonUsageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DayUsageDto)
  dayUsage?: DayUsageDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OccasionRatingsDto)
  occasions?: OccasionRatingsDto;

  @IsOptional()
  @IsEnum(Sillage)
  sillage?: Sillage;

  @IsOptional()
  @IsEnum(Longevity)
  longevity?: Longevity;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
