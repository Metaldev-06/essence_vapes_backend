import { Matches } from 'class-validator';

export class VerifyPasswordChangeCodeDto {
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}
