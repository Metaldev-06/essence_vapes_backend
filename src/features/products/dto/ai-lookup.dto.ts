import { IsNotEmpty, IsString } from 'class-validator';

export class AiLookupDto {
  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}
