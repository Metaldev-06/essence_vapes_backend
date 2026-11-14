import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SetStockThresholdDto {
  // El id de un producto es su slug (`PrimaryColumn` varchar), no un UUID.
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productId!: string;

  /** `'base'` (default) para el producto sin variantes, o el id de la variante. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  variantId?: string;

  @IsInt()
  @Min(0)
  @Max(1000)
  threshold!: number;
}
