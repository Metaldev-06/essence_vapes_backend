import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AiLookupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  brand!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
