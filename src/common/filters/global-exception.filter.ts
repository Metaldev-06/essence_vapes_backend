import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { AbuseDetectionService } from '../../features/security/abuse-detection.service';
import { SecurityEventType } from '../../features/security/enums/security-event-type.enum';
import { LoggerHelper } from '../helpers/logger.helper';

interface RequestLike {
  ip?: string;
  path?: string;
  method?: string;
  id?: string;
  user?: { id?: string };
}

interface ResponseLike {
  status: (code: number) => { json: (body: unknown) => void };
  getHeader?: (name: string) => unknown;
}

const SENSITIVE_STATUS_CODES = new Set([401, 403, 404]);

/** El texto de `ThrottlerException` es inglés ("Too Many Requests") - se reemplaza por uno en
 *  español, como el resto de los errores que ve el cliente. */
const TOO_MANY_REQUESTS_MESSAGE =
  'Hiciste muchas solicitudes en poco tiempo. Esperá un momento y se va a reintentar solo.';

/**
 * Segundos que faltan para que el límite se libere, tal como los calculó `ThrottlerGuard` (el
 * header `Retry-After`, que ya setea antes de tirar la excepción). Es el tiempo RESTANTE real,
 * no el período completo: si el cliente recarga, el número sigue bajando.
 */
function readRetryAfterSeconds(response: ResponseLike): number | null {
  const raw = response.getHeader?.('Retry-After');
  const seconds = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/**
 * Única fuente de verdad de la forma de las respuestas de error. Cualquier excepción que
 * NOSOTROS lanzamos a propósito (`BadRequestException`, `NotFoundException`, etc. - siempre
 * con mensajes en español ya pensados para el cliente) pasa tal cual. Todo lo demás (errores
 * no controlados: fallas de driver, bugs) nunca expone su mensaje real, stack, SQL ni rutas
 * internas - solo un mensaje genérico + el `requestId` para buscarlo en los logs del server.
 * También alimenta `AbuseDetectionService` con los 401/403/404, sin que cada controller tenga
 * que acordarse de hacerlo.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly abuseDetectionService: AbuseDetectionService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ResponseLike>();
    const request = ctx.getRequest<RequestLike>();

    const { status, message } = this.resolve(exception);
    const requestId = request.id;

    LoggerHelper(
      `[${requestId ?? 'sin-id'}] ${request.method ?? '?'} ${request.path ?? '?'} -> ${status}: ` +
        (exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)),
      'GlobalExceptionFilter',
      status >= 500,
    );

    if (SENSITIVE_STATUS_CODES.has(status)) {
      const type =
        status === 404
          ? SecurityEventType.NOT_FOUND_SENSITIVE
          : request.path?.includes('/admin') || request.path?.includes('/security')
            ? SecurityEventType.ADMIN_ACCESS_DENIED
            : SecurityEventType.FORBIDDEN;

      void this.abuseDetectionService.record({
        type,
        ip: request.ip ?? 'unknown',
        path: request.path ?? 'unknown',
        method: request.method ?? 'unknown',
        statusCode: status,
        userId: request.user?.id ?? null,
        requestId,
      });
    }

    if (exception instanceof ThrottlerException) {
      // En el cuerpo además del header: así el front lo lee aunque un proxy o CORS oculten el
      // header, y muestra una cuenta regresiva real.
      response.status(status).json({
        statusCode: status,
        message: TOO_MANY_REQUESTS_MESSAGE,
        retryAfterSeconds: readRetryAfterSeconds(response),
        requestId,
      });
      return;
    }

    // Otros 429 propios (ej. el tope diario de formularios) traen su mensaje, un `code` para que
    // el front sepa cómo mostrarlos y cuánto falta: se respetan tal cual.
    if (status === HttpStatus.TOO_MANY_REQUESTS && exception instanceof HttpException) {
      const body = exception.getResponse() as { code?: unknown; retryAfterSeconds?: unknown };
      response.status(status).json({
        statusCode: status,
        message,
        code: typeof body?.code === 'string' ? body.code : undefined,
        retryAfterSeconds: typeof body?.retryAfterSeconds === 'number' ? body.retryAfterSeconds : null,
        requestId,
      });
      return;
    }

    response.status(status).json({ statusCode: status, message, requestId });
  }

  private resolve(exception: unknown): { status: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] } | null)?.message ?? exception.message);
      return { status: exception.getStatus(), message };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Ocurrió un error inesperado. Si el problema persiste, contactanos.',
    };
  }
}
