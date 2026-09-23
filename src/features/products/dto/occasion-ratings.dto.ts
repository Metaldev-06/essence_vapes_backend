import { IsInt, Max, Min } from 'class-validator';

export class OccasionRatingsDto {
  @IsInt()
  @Min(0)
  @Max(5)
  trabajo!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  romantico!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  social!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  casual!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  formal!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  deporte!: number;
}
