import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces';

import { ProcessPaymentDto } from './process-payment.dto';

const validBody = {
  orderId: 'order-1',
  token: 'tok_abc',
  paymentMethodId: 'visa',
  paymentMethodType: 'credit_card',
  installments: 1,
  payer: { email: 'buyer@example.com' },
};

/** Mismo criterio que `create-order.dto.spec.ts`: prueba el `ValidationPipe` real, sin DI. */
describe('ProcessPaymentDto (ValidationPipe real)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata: ArgumentMetadata = { type: 'body', metatype: ProcessPaymentDto, data: '' };

  it('acepta un body válido de tarjeta', async () => {
    await expect(pipe.transform({ ...validBody }, metadata)).resolves.toBeInstanceOf(
      ProcessPaymentDto,
    );
  });

  it('rechaza un medio de pago distinto de tarjeta (fuera del alcance de esta integración)', async () => {
    await expect(
      pipe.transform({ ...validBody, paymentMethodType: 'ticket' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un intento de mandar un monto desde el cliente - campo no declarado en el DTO', async () => {
    await expect(
      pipe.transform({ ...validBody, transaction_amount: 1 }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza installments no entero/positivo', async () => {
    await expect(
      pipe.transform({ ...validBody, installments: 0 }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza sin token', async () => {
    const { token, ...withoutToken } = validBody;
    await expect(pipe.transform(withoutToken, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });
});
