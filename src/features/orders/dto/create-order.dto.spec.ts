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

  it('acepta un body sin deliveryMethod (default home_delivery - compatibilidad)', async () => {
    const result = await pipe.transform({ addressId: 'addr-1', acceptTerms: true }, metadata);
    expect(result).toEqual({ addressId: 'addr-1', acceptTerms: true });
  });

  it('acepta un envío a domicilio explícito con addressId', async () => {
    const result = await pipe.transform(
      { deliveryMethod: 'home_delivery', addressId: 'addr-1', acceptTerms: true },
      metadata,
    );
    expect(result).toEqual({ deliveryMethod: 'home_delivery', addressId: 'addr-1', acceptTerms: true });
  });

  it('acepta un retiro en el local válido (sin addressId, con contacto)', async () => {
    const result = await pipe.transform(
      {
        deliveryMethod: 'pickup',
        pickupContactName: 'Juan Pérez',
        pickupPhone: '+54 9 11 1234-5678',
        acceptTerms: true,
      },
      metadata,
    );
    expect(result).toEqual({
      deliveryMethod: 'pickup',
      pickupContactName: 'Juan Pérez',
      pickupPhone: '+54 9 11 1234-5678',
      acceptTerms: true,
    });
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

  it('rechaza envío a domicilio sin addressId', async () => {
    await expect(pipe.transform({ acceptTerms: true }, metadata)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza retiro sin nombre de contacto', async () => {
    await expect(
      pipe.transform({ deliveryMethod: 'pickup', pickupPhone: '123', acceptTerms: true }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza retiro sin teléfono', async () => {
    await expect(
      pipe.transform({ deliveryMethod: 'pickup', pickupContactName: 'Juan', acceptTerms: true }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un deliveryMethod inválido', async () => {
    await expect(
      pipe.transform({ deliveryMethod: 'teleport', addressId: 'addr-1', acceptTerms: true }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
