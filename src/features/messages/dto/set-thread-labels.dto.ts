import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SetThreadLabelsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  labelIds!: string[];
}
