import { Equals, IsNotEmpty, IsString } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  addressId!: string;

  // Debe llegar literalmente `true` - aceptar términos no es opcional ni implícito. Ver
  // `Order.termsAcceptedAt` (se guarda el momento exacto, no solo este booleano).
  @Equals(true, { message: 'Debés aceptar los Términos y Condiciones para continuar' })
  acceptTerms!: boolean;
}
