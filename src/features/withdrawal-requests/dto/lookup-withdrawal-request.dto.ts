import { IsEmail, IsString, MinLength } from 'class-validator';

export class LookupWithdrawalRequestDto {
  @IsString()
  @MinLength(5, { message: 'Ingresá el código de gestión que recibiste' })
  trackingCode!: string;

  @IsEmail({}, { message: 'Ingresá el email con el que hiciste la solicitud' })
  email!: string;
}
