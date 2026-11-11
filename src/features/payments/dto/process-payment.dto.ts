import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Tal como la entrega el Payment Brick en `onSubmit({ formData })` - nunca incluye el número de
 *  tarjeta ni el CVV (ya están tokenizados por MercadoPago.js del lado del navegador). */
class PaymentIdentificationDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsString()
  @IsNotEmpty()
  number!: string;
}

class PaymentPayerDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentIdentificationDto)
  identification?: PaymentIdentificationDto;
}

export class ProcessPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;

  @IsIn(['credit_card', 'debit_card'])
  paymentMethodType!: 'credit_card' | 'debit_card';

  @IsOptional()
  @IsString()
  issuerId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  installments!: number;

  @ValidateNested()
  @Type(() => PaymentPayerDto)
  payer!: PaymentPayerDto;
}
