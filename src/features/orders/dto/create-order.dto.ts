import {
  Equals,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { DeliveryMethod } from '../enums/delivery-method.enum';

export class CreateOrderDto {
  // Opcional con default `HOME_DELIVERY` en `OrdersService.createFromCart` - compatibilidad con
  // clientes que todavía no mandan modalidad explícitamente.
  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @ValidateIf(
    (dto: CreateOrderDto) => (dto.deliveryMethod ?? DeliveryMethod.HOME_DELIVERY) === DeliveryMethod.HOME_DELIVERY,
  )
  @IsString()
  @IsNotEmpty({ message: 'Elegí una dirección de envío' })
  addressId?: string;

  @ValidateIf((dto: CreateOrderDto) => dto.deliveryMethod === DeliveryMethod.PICKUP)
  @IsString()
  @IsNotEmpty({ message: 'Ingresá el nombre de quien retira' })
  @MaxLength(80)
  pickupContactName?: string;

  @ValidateIf((dto: CreateOrderDto) => dto.deliveryMethod === DeliveryMethod.PICKUP)
  @IsString()
  @IsNotEmpty({ message: 'Ingresá un teléfono de contacto para el retiro' })
  @MaxLength(30)
  @Matches(/^[\d\s()+-]{6,30}$/, { message: 'Ingresá un teléfono válido' })
  pickupPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupNotes?: string;

  // Debe llegar literalmente `true` - aceptar términos no es opcional ni implícito. Ver
  // `Order.termsAcceptedAt` (se guarda el momento exacto, no solo este booleano).
  @Equals(true, { message: 'Debés aceptar los Términos y Condiciones para continuar' })
  acceptTerms!: boolean;
}
