import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;

  @IsInt()
  @Min(0)
  priceValue!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  costValue?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}
