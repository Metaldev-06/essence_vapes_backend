import { verifyResendWebhook } from './webhook-signature.helper';

describe('verifyResendWebhook', () => {
  const rawBody = '{"type":"inbox.email.received"}';
  const validHeaders = { id: 'msg_1', timestamp: '1700000000', signature: 'v1,validsig' };

  it('devuelve null si falta cualquier header de Svix', () => {
    expect(
      verifyResendWebhook({ webhooks: { verify: jest.fn() } } as never, rawBody, {
        id: undefined,
        timestamp: '1700000000',
        signature: 'v1,sig',
      }, 'secret'),
    ).toBeNull();
  });

  it('devuelve null si el SDK rechaza la firma (lanza)', () => {
    const resend = {
      webhooks: {
        verify: jest.fn(() => {
          throw new Error('invalid signature');
        }),
      },
    };
    expect(verifyResendWebhook(resend as never, rawBody, validHeaders, 'secret')).toBeNull();
  });

  it('devuelve el payload tipado cuando el SDK valida la firma', () => {
    const payload = { type: 'inbox.email.received', created_at: '2026-01-01T00:00:00Z', data: {} };
    const verify = jest.fn().mockReturnValue(payload);
    const resend = { webhooks: { verify } };

    const result = verifyResendWebhook(resend as never, rawBody, validHeaders, 'secret');

    expect(result).toBe(payload);
    expect(verify).toHaveBeenCalledWith({
      payload: rawBody,
      headers: validHeaders,
      webhookSecret: 'secret',
    });
  });
});
