import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SetCartItemDto {
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  variantId?: string;
}
