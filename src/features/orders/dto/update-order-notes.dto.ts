import { IsString, MaxLength } from 'class-validator';

export class UpdateOrderNotesDto {
  @IsString()
  @MaxLength(2000)
  notes!: string;
}
