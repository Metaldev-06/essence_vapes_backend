import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ArgumentMetadata } from '@nestjs/common/interfaces';

import { CreateOrderDto } from './create-order.dto';

/**
 * Prueba la protección real contra manipulación de precios: el `ValidationPipe` global
 * (`whitelist: true, forbidNonWhitelisted: true`, ver `main.ts`) es lo que de verdad impide que
 * un cliente mande `totalValue`/`priceValue` en el body de `POST /orders` - `CreateOrderDto` ni
 * siquiera declara esos campos, así que cualquier intento de mandarlos es rechazado acá, antes
 * de que `OrdersService` llegue a verlos. No necesita DI (el pipe no depende de TypeORM/Config),
 * así que puede testearse de verdad, a diferencia de los servicios (ver `lockout-tier.helper.ts`
 * para el porqué de esa limitación en este proyecto).
 */
describe('CreateOrderDto (ValidationPipe real)', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata: ArgumentMetadata = { type: 'body', metatype: CreateOrderDto, data: '' };

  it('acepta un body válido (solo addressId + acceptTerms)', async () => {
    const result = await pipe.transform({ addressId: 'addr-1', acceptTerms: true }, metadata);
    expect(result).toEqual({ addressId: 'addr-1', acceptTerms: true });
  });

  it('rechaza un intento de mandar un total/precio - campo no declarado en el DTO', async () => {
    await expect(
      pipe.transform({ addressId: 'addr-1', acceptTerms: true, totalValue: 1 }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza acceptTerms=false', async () => {
    await expect(
      pipe.transform({ addressId: 'addr-1', acceptTerms: false }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza sin addressId', async () => {
    await expect(pipe.transform({ acceptTerms: true }, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
