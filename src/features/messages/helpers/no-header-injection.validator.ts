import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Rechaza cualquier valor con un salto de línea (CR/LF) - la defensa real contra inyección de
 * encabezados de correo (un `to`/`cc`/`subject` con un `\n` seguido de un header falso) tiene que
 * pasar por acá, no solo confiar en que el SDK de Resend lo sanee. Aplica a campos de texto plano
 * usados para construir un email (asunto, nombres, etc.) - nunca al HTML del cuerpo, que tiene su
 * propio sanitizador (`sanitize-email-html.helper.ts`).
 */
export function NoHeaderInjection(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'noHeaderInjection',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value !== 'string' || !/[\r\n]/.test(value);
        },
        defaultMessage(): string {
          return 'El campo no puede contener saltos de línea';
        },
      },
    });
  };
}
