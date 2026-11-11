import { DeliveryMethod } from '../enums/delivery-method.enum';
import { LogisticsStatus } from '../enums/logistics-status.enum';
import { getAllowedLogisticsStatuses, isValidLogisticsStatusForMethod } from './logistics-status.helper';

describe('logistics-status.helper', () => {
  it('un envío a domicilio admite READY_TO_SHIP pero no READY_FOR_PICKUP', () => {
    expect(isValidLogisticsStatusForMethod(LogisticsStatus.READY_TO_SHIP, DeliveryMethod.HOME_DELIVERY)).toBe(true);
    expect(isValidLogisticsStatusForMethod(LogisticsStatus.READY_FOR_PICKUP, DeliveryMethod.HOME_DELIVERY)).toBe(false);
  });

  it('un retiro admite READY_FOR_PICKUP/PICKED_UP pero no estados de envío', () => {
    expect(isValidLogisticsStatusForMethod(LogisticsStatus.READY_FOR_PICKUP, DeliveryMethod.PICKUP)).toBe(true);
    expect(isValidLogisticsStatusForMethod(LogisticsStatus.PICKED_UP, DeliveryMethod.PICKUP)).toBe(true);
    expect(isValidLogisticsStatusForMethod(LogisticsStatus.DISPATCHED, DeliveryMethod.PICKUP)).toBe(false);
  });

  it('los estados compartidos (pendiente/en preparación) aplican a ambas modalidades', () => {
    for (const method of [DeliveryMethod.HOME_DELIVERY, DeliveryMethod.PICKUP]) {
      expect(isValidLogisticsStatusForMethod(LogisticsStatus.PENDING_PREPARATION, method)).toBe(true);
      expect(isValidLogisticsStatusForMethod(LogisticsStatus.IN_PREPARATION, method)).toBe(true);
    }
  });

  it('getAllowedLogisticsStatuses no repite valores entre sí', () => {
    const homeDelivery = getAllowedLogisticsStatuses(DeliveryMethod.HOME_DELIVERY);
    expect(new Set(homeDelivery).size).toBe(homeDelivery.length);
  });
});
