import { PaymentStatus } from '../../orders/enums/payment-status.enum';

/**
 * Tabla de equivalencias citada de la documentación oficial de Mercado Pago ("Cómo migrar de
 * Payments API a Orders API" > "5. Actualizar el modelo de estados") - `status` a nivel de
 * order/transacción en Orders API, nunca inventado. `created` (justo después de crear la
 * order, antes de que MP procese la transacción) se trata igual que `action_required`.
 */
const MP_STATUS_TO_PAYMENT_STATUS: Record<string, PaymentStatus> = {
  created: PaymentStatus.PENDING,
  action_required: PaymentStatus.PENDING,
  processing: PaymentStatus.IN_PROCESS,
  processed: PaymentStatus.APPROVED,
  failed: PaymentStatus.REJECTED,
  canceled: PaymentStatus.CANCELLED,
  refunded: PaymentStatus.REFUNDED,
  charged_back: PaymentStatus.CHARGED_BACK,
};

/** Función pura, sin DI - ver `order-totals.helper.ts` para el porqué de este estilo acá. */
export const mapMercadoPagoStatus = (mpStatus: string): PaymentStatus =>
  MP_STATUS_TO_PAYMENT_STATUS[mpStatus] ?? PaymentStatus.PENDING;
