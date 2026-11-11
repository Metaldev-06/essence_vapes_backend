import { PaymentStatus } from '../../orders/enums/payment-status.enum';
import { mapMercadoPagoStatus } from './mp-status-mapper.helper';

describe('mapMercadoPagoStatus', () => {
  it.each([
    ['created', PaymentStatus.PENDING],
    ['action_required', PaymentStatus.PENDING],
    ['processing', PaymentStatus.IN_PROCESS],
    ['processed', PaymentStatus.APPROVED],
    ['failed', PaymentStatus.REJECTED],
    ['canceled', PaymentStatus.CANCELLED],
    ['refunded', PaymentStatus.REFUNDED],
    ['charged_back', PaymentStatus.CHARGED_BACK],
  ])('mapea "%s" -> %s', (mpStatus, expected) => {
    expect(mapMercadoPagoStatus(mpStatus)).toBe(expected);
  });

  it('un status desconocido/futuro de Mercado Pago cae en PENDING en vez de romper', () => {
    expect(mapMercadoPagoStatus('algo_nuevo_no_documentado')).toBe(PaymentStatus.PENDING);
  });
});
