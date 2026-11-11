import { registerAs } from '@nestjs/config';

import { LoggerHelper } from '../common/helpers/logger.helper';
import { ShippingCostMode } from '../features/orders/enums/shipping-cost-mode.enum';

/**
 * Estrategia de costo de envío + datos del punto de retiro propio (ver tarea: sin Mercado
 * Envíos, gestión 100% manual). Default `FREE`: preserva el comportamiento de hoy (sin costo de
 * envío) hasta que el titular configure una estrategia real - cambiar `SHIPPING_COST_MODE` a
 * `to_coordinate`/`fixed`/`by_province` es una decisión comercial explícita, nunca el default.
 *
 * `SHIPPING_PROVINCE_RATES_JSON` es un mapa `{ "Provincia": montoEntero, ... }` - interino hasta
 * que exista una pantalla admin para editarlo (ver tarea, punto 3: "arquitectura que permita
 * configurar posteriormente"); `resolveShippingCost` no le importa de dónde viene el mapa.
 *
 * Ningún dato del punto de retiro se inventa: sin las env vars seteadas, se expone un
 * placeholder "[COMPLETAR: ...]" explícito (mismo criterio que `legal.config.ts`).
 */
export default registerAs('shipping', () => {
  const rawProvinceRates = process.env.SHIPPING_PROVINCE_RATES_JSON || '';
  let provinceRates: Record<string, number> = {};
  if (rawProvinceRates) {
    try {
      provinceRates = JSON.parse(rawProvinceRates) as Record<string, number>;
    } catch {
      LoggerHelper(
        'SHIPPING_PROVINCE_RATES_JSON no es un JSON válido - se ignora (sin tarifas por provincia)',
        'ShippingConfig',
        true,
      );
    }
  }

  return {
    costMode: (process.env.SHIPPING_COST_MODE as ShippingCostMode) || ShippingCostMode.FREE,
    fixedCostValue:
      process.env.SHIPPING_FIXED_COST_VALUE !== undefined
        ? Number(process.env.SHIPPING_FIXED_COST_VALUE)
        : undefined,
    provinceRates,
    pickupPoint: {
      address: process.env.PICKUP_POINT_ADDRESS || '[COMPLETAR: dirección del punto de retiro]',
      hours: process.env.PICKUP_POINT_HOURS || '[COMPLETAR: horario de atención para retiro]',
      notes: process.env.PICKUP_POINT_NOTES || undefined,
    },
  };
});
