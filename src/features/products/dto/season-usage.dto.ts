import { IsInt, Max, Min } from 'class-validator';

export class SeasonUsageDto {
  @IsInt()
  @Min(0)
  @Max(5)
  primavera!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  verano!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  otono!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  invierno!: number;
}
