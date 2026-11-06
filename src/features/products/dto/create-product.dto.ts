import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { FragranceConcentration } from '../enums/fragrance-concentration.enum';
import { Gender } from '../enums/gender.enum';
import { Longevity } from '../enums/longevity.enum';
import { ProductCategory } from '../enums/product-category.enum';
import { SaleAuthorizationStatus } from '../enums/sale-authorization-status.enum';
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
    message:
      'id debe ser un slug en minúsculas (solo letras, números y guiones)',
  })
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  brand!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subtitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  variantLabel?: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
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
  @MaxLength(60)
  badge?: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'accent debe ser un color hexadecimal válido (ej: #8b5cf6)',
  })
  accent!: string;

  @IsEnum(ProductCategory)
  category!: ProductCategory;

  @IsArray()
  @ArrayMaxSize(10)
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
  @MaxLength(80)
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
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  accords?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FragranceNotesDto)
  fragranceNotes?: FragranceNotesDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
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

  // --- Transparencia de producto ---
  @IsOptional()
  @IsString()
  @MaxLength(80)
  countryOfOrigin?: string;

  @IsOptional()
  @IsEnum(FragranceConcentration)
  concentration?: FragranceConcentration;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  netContentMl?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  manufacturerOrImporter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sanitaryRegistrationNumber?: string;

  // --- Decants ---
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decantSourceDescription?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  decantVolumeMl?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  batchNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceProductId?: string;

  // --- Vapes ---
  @IsOptional()
  @IsEnum(SaleAuthorizationStatus)
  saleAuthorizationStatus?: SaleAuthorizationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  saleAuthorizationCode?: string;
}
