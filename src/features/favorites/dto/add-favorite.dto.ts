import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddFavoriteDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  variantId?: string;
}
