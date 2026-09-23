import { IsArray, IsString } from 'class-validator';

export class FragranceNotesDto {
  @IsArray()
  @IsString({ each: true })
  top!: string[];

  @IsArray()
  @IsString({ each: true })
  heart!: string[];

  @IsArray()
  @IsString({ each: true })
  base!: string[];
}
