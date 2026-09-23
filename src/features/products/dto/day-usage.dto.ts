import { IsInt, Max, Min } from 'class-validator';

export class DayUsageDto {
  @IsInt()
  @Min(0)
  @Max(5)
  dia!: number;

  @IsInt()
  @Min(0)
  @Max(5)
  noche!: number;
}
