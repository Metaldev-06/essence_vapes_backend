import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWithdrawalRequestDto {
  @IsString()
  @MinLength(3, { message: 'Ingresá tu nombre completo' })
  @MaxLength(120)
  buyerName!: string;

  @IsEmail({}, { message: 'Ingresá un email válido' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /** Texto libre: hoy no existe un sistema de pedidos contra el cual validar esto. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderReference?: string;

  @IsString()
  @MinLength(3, { message: 'Describí qué producto querés devolver' })
  @MaxLength(500)
  productDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}
