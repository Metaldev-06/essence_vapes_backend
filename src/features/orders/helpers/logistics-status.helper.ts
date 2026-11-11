import { DeliveryMethod } from '../enums/delivery-method.enum';
import { LogisticsStatus } from '../enums/logistics-status.enum';

const SHARED_STATUSES = [LogisticsStatus.PENDING_PREPARATION, LogisticsStatus.IN_PREPARATION];

const HOME_DELIVERY_STATUSES = [
  ...SHARED_STATUSES,
  LogisticsStatus.READY_TO_SHIP,
  LogisticsStatus.DISPATCHED,
  LogisticsStatus.IN_TRANSIT,
  LogisticsStatus.DELIVERED,
  LogisticsStatus.DELIVERY_ISSUE,
];

const PICKUP_STATUSES = [
  ...SHARED_STATUSES,
  LogisticsStatus.READY_FOR_PICKUP,
  LogisticsStatus.PICKED_UP,
];

/** Función pura, sin DI (mismo criterio que `order-totals.helper.ts`/`order-status.helper.ts`). */
export const getAllowedLogisticsStatuses = (method: DeliveryMethod): readonly LogisticsStatus[] =>
  method === DeliveryMethod.PICKUP ? PICKUP_STATUSES : HOME_DELIVERY_STATUSES;

export const isValidLogisticsStatusForMethod = (
  status: LogisticsStatus,
  method: DeliveryMethod,
): boolean => getAllowedLogisticsStatuses(method).includes(status);
