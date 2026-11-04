import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SetCartItemDto {
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsString()
  variantId?: string;
}
