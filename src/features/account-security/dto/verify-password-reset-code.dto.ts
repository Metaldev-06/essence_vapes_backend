import { IsEmail, Matches } from 'class-validator';

export class VerifyPasswordResetCodeDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}
