import { DeliveryMethod } from '../enums/delivery-method.enum';
import { ShippingCostMode } from '../enums/shipping-cost-mode.enum';
import { resolveShippingCost } from './shipping-cost.helper';

describe('resolveShippingCost', () => {
  it('un retiro en el local siempre es $0, sin importar la estrategia configurada', () => {
    const config = { mode: ShippingCostMode.TO_COORDINATE, provinceRates: {} };
    expect(resolveShippingCost(config, DeliveryMethod.PICKUP)).toEqual({
      mode: null,
      value: 0,
      requiresQuote: false,
    });
  });

  it('FREE siempre resuelve a $0 sin requerir cotización', () => {
    const config = { mode: ShippingCostMode.FREE, provinceRates: {} };
    expect(resolveShippingCost(config, DeliveryMethod.HOME_DELIVERY)).toEqual({
      mode: ShippingCostMode.FREE,
      value: 0,
      requiresQuote: false,
    });
  });

  it('FIXED usa el valor configurado', () => {
    const config = { mode: ShippingCostMode.FIXED, fixedCostValue: 5000, provinceRates: {} };
    expect(resolveShippingCost(config, DeliveryMethod.HOME_DELIVERY)).toEqual({
      mode: ShippingCostMode.FIXED,
      value: 5000,
      requiresQuote: false,
    });
  });

  it('FIXED sin valor configurado nunca inventa un monto - pide cotización', () => {
    const config = { mode: ShippingCostMode.FIXED, provinceRates: {} };
    expect(resolveShippingCost(config, DeliveryMethod.HOME_DELIVERY)).toEqual({
      mode: ShippingCostMode.FIXED,
      value: null,
      requiresQuote: true,
    });
  });

  it('BY_PROVINCE usa la tarifa de la provincia si existe', () => {
    const config = { mode: ShippingCostMode.BY_PROVINCE, provinceRates: { Córdoba: 3500 } };
    expect(resolveShippingCost(config, DeliveryMethod.HOME_DELIVERY, 'Córdoba')).toEqual({
      mode: ShippingCostMode.BY_PROVINCE,
      value: 3500,
      requiresQuote: false,
    });
  });

  it('BY_PROVINCE sin tarifa para la provincia pide cotización en vez de inventar un monto', () => {
    const config = { mode: ShippingCostMode.BY_PROVINCE, provinceRates: { Córdoba: 3500 } };
    expect(resolveShippingCost(config, DeliveryMethod.HOME_DELIVERY, 'Chaco')).toEqual({
      mode: ShippingCostMode.BY_PROVINCE,
      value: null,
      requiresQuote: true,
    });
  });

  it('TO_COORDINATE siempre pide cotización', () => {
    const config = { mode: ShippingCostMode.TO_COORDINATE, provinceRates: {} };
    expect(resolveShippingCost(config, DeliveryMethod.HOME_DELIVERY)).toEqual({
      mode: ShippingCostMode.TO_COORDINATE,
      value: null,
      requiresQuote: true,
    });
  });
});
