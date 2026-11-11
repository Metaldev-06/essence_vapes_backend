import { DeliveryMethod } from '../enums/delivery-method.enum';
import { ShippingCostMode } from '../enums/shipping-cost-mode.enum';

export interface ShippingCostConfig {
  mode: ShippingCostMode;
  fixedCostValue?: number;
  provinceRates: Readonly<Record<string, number>>;
}

export interface ShippingCostResolution {
  mode: ShippingCostMode | null;
  /** `null` = todavía no se conoce - nunca se inventa un valor, la orden queda a definir. */
  value: number | null;
  requiresQuote: boolean;
}

/**
 * Único lugar que resuelve el costo de envío de una orden - función pura, sin DI (mismo criterio
 * que `order-totals.helper.ts`). Mercado Pago nunca calcula esto (la Orders API no tiene un
 * campo de costo de envío, confirmado contra la documentación oficial) - es lógica 100% propia.
 * Un retiro en el local nunca tiene costo de envío, sea cual sea la estrategia configurada.
 */
export const resolveShippingCost = (
  config: ShippingCostConfig,
  deliveryMethod: DeliveryMethod,
  province?: string,
): ShippingCostResolution => {
  if (deliveryMethod === DeliveryMethod.PICKUP) {
    return { mode: null, value: 0, requiresQuote: false };
  }

  switch (config.mode) {
    case ShippingCostMode.FREE:
      return { mode: config.mode, value: 0, requiresQuote: false };

    case ShippingCostMode.FIXED:
      return config.fixedCostValue != null
        ? { mode: config.mode, value: config.fixedCostValue, requiresQuote: false }
        : { mode: config.mode, value: null, requiresQuote: true };

    case ShippingCostMode.BY_PROVINCE: {
      const rate = province ? config.provinceRates[province] : undefined;
      return rate != null
        ? { mode: config.mode, value: rate, requiresQuote: false }
        : { mode: config.mode, value: null, requiresQuote: true };
    }

    case ShippingCostMode.TO_COORDINATE:
    default:
      return { mode: config.mode, value: null, requiresQuote: true };
  }
};
