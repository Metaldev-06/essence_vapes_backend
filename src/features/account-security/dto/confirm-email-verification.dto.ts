import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmEmailVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;
}
