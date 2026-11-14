import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';

class PushKeysDto {
  @IsString()
  @MinLength(20)
  @MaxLength(255)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  auth!: string;
}

/** Mismo shape que devuelve `PushSubscription.toJSON()` en el navegador. */
export class CreatePushSubscriptionDto {
  // Solo https: el backend va a hacer requests salientes a esta URL, así que no puede ser un
  // esquema arbitrario. El host además se valida contra los servicios de push conocidos en
  // `NotificationsPushService` (evita usar este endpoint para pegarle a una URL interna).
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(1024)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
