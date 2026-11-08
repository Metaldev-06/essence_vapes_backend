import { IsString, MaxLength } from 'class-validator';

export class UpdateSignatureDto {
  @IsString()
  @MaxLength(2000)
  body!: string;
}
