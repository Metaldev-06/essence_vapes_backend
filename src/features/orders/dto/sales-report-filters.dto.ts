import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

import { DeliveryMethod } from '../enums/delivery-method.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { DateRangeQueryDto } from './date-range-query.dto';

const PAYMENT_METHOD_TYPES = ['credit_card', 'debit_card'] as const;

/**
 * Filtros opcionales compartidos por todos los endpoints de reportes de ventas (ver tarea, punto
 * 4.1) - todos opcionales a propósito: el dashboard (Fase 3) sigue llamando a los mismos
 * endpoints sin pasarlos y obtiene exactamente el mismo resultado de siempre (confirmados =
 * aprobados). Cuando el reporte sí los pasa, cada filtro restringe tanto los pedidos (estado,
 * entrega, comprador) como las líneas vendidas (categoría/marca/producto/variante) - nunca se
 * duplica la lógica de agregación para esto, se reutilizan los mismos métodos de
 * `OrdersService`.
 */
export class SalesReportFiltersDto extends DateRangeQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  /** Si se pasa, reemplaza el default "aprobado" de las métricas de ventas confirmadas - permite
   *  explorar, por ejemplo, cuánto se rechazó en el período. */
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @IsOptional()
  @IsIn(PAYMENT_METHOD_TYPES)
  paymentMethodType?: (typeof PAYMENT_METHOD_TYPES)[number];

  /** Búsqueda por nombre o email del comprador - mismo criterio que el resto del admin. */
  @IsOptional()
  @IsString()
  buyer?: string;
}
