import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

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
}

const SENSITIVE_STATUS_CODES = new Set([401, 403, 404]);

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
