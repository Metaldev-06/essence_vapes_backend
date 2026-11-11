import { createHmac } from 'crypto';

import { verifyMercadoPagoSignature } from './mp-webhook-signature.helper';

const SECRET = 'test-secret';

const sign = (manifest: string, secret = SECRET) =>
  createHmac('sha256', secret).update(manifest).digest('hex');

describe('verifyMercadoPagoSignature', () => {
  it('acepta una firma válida con dataId + xRequestId + ts', () => {
    const ts = '1700000000000';
    const manifest = 'id:abc123;request-id:req-1;ts:1700000000000;';
    const v1 = sign(manifest);

    const result = verifyMercadoPagoSignature({
      dataId: 'ABC123',
      xRequestId: 'req-1',
      xSignature: `ts=${ts},v1=${v1}`,
      secret: SECRET,
    });
    expect(result).toBe(true);
  });

  it('rechaza si el v1 no coincide (secreto equivocado o payload alterado)', () => {
    const ts = '1700000000000';
    const manifest = 'id:abc123;request-id:req-1;ts:1700000000000;';
    const v1 = sign(manifest, 'otro-secreto');

    const result = verifyMercadoPagoSignature({
      dataId: 'abc123',
      xRequestId: 'req-1',
      xSignature: `ts=${ts},v1=${v1}`,
      secret: SECRET,
    });
    expect(result).toBe(false);
  });

  it('omite la línea id/request-id del manifest cuando el valor no está presente', () => {
    const ts = '1700000000000';
    const manifest = 'ts:1700000000000;';
    const v1 = sign(manifest);

    const result = verifyMercadoPagoSignature({
      xSignature: `ts=${ts},v1=${v1}`,
      secret: SECRET,
    });
    expect(result).toBe(true);
  });

  it('rechaza sin secret configurado', () => {
    expect(
      verifyMercadoPagoSignature({ xSignature: 'ts=1,v1=deadbeef', secret: '' }),
    ).toBe(false);
  });

  it('rechaza un header x-signature mal formado', () => {
    expect(verifyMercadoPagoSignature({ xSignature: 'sin-formato', secret: SECRET })).toBe(false);
  });
});
