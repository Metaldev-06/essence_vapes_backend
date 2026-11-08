import { InboxAddress } from '../enums/inbox-address.enum';
import { resolveInboxAddress } from './resolve-inbox-address.helper';

const addresses: Record<InboxAddress, string> = {
  [InboxAddress.CONTACTO]: 'contacto@essencevapes.com.ar',
  [InboxAddress.VENTAS]: 'ventas@essencevapes.com.ar',
  [InboxAddress.SOPORTE]: 'soporte@essencevapes.com.ar',
};

describe('resolveInboxAddress', () => {
  it('resuelve una de las 3 direcciones reales a su enum', () => {
    expect(resolveInboxAddress(addresses, 'ventas@essencevapes.com.ar')).toBe(InboxAddress.VENTAS);
  });

  it('es case-insensitive', () => {
    expect(resolveInboxAddress(addresses, 'SOPORTE@EssenceVapes.com.ar')).toBe(InboxAddress.SOPORTE);
  });

  it('ignora espacios alrededor', () => {
    expect(resolveInboxAddress(addresses, '  contacto@essencevapes.com.ar  ')).toBe(InboxAddress.CONTACTO);
  });

  it('devuelve null para no-reply@ (nunca es una bandeja consultable)', () => {
    expect(resolveInboxAddress(addresses, 'no-reply@essencevapes.com.ar')).toBeNull();
  });

  it('devuelve null para cualquier dirección ajena', () => {
    expect(resolveInboxAddress(addresses, 'otra@dominio.com')).toBeNull();
  });
});
