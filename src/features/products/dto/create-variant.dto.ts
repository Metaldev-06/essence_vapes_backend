import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsInt()
  @Min(0)
  priceValue!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
