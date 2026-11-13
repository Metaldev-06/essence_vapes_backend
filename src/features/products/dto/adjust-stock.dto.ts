import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';

export class AdjustStockDto {
  @IsOptional()
  @IsString()
  variantId?: string = 'base';

  @IsInt()
  @NotEquals(0)
  quantityChange!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
