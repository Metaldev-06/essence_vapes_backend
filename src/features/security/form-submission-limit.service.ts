import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'node:crypto';

import { LessThan, MoreThan, Repository } from 'typeorm';

import { FormSubmission, LimitedForm } from './entities/form-submission.entity';

/** Envíos permitidos por visitante (IP) y por formulario en la ventana de abajo. */
export const DAILY_FORM_SUBMISSION_LIMIT = 2;
/** Ventana móvil de 24 horas: cuenta los envíos de las últimas 24 h, no "desde la medianoche"
 *  (así no se pueden mandar 2 a las 23:59 y otros 2 a las 00:01). */
export const FORM_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Lo que queda en la tabla: el doble de la ventana, de margen. */
const RETENTION_MS = 2 * FORM_SUBMISSION_WINDOW_MS;

/** Código que el front usa para mostrar el aviso en el formulario y NO pausar todo el sitio
 *  (el 429 del límite por minuto sí lo pausa - ver `rateLimitInterceptor`). */
export const DAILY_LIMIT_CODE = 'DAILY_LIMIT_REACHED';

/** "5 h 20 min", "45 min", "1 min". */
export function formatWait(seconds: number): string {
  const totalMinutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function limitMessage(form: LimitedForm, retryAfterSeconds: number): string {
  const wait = formatWait(retryAfterSeconds);
  if (form === LimitedForm.WITHDRAWAL) {
    // El arrepentimiento es un derecho (Disposición 954/2025): el tope frena abusos, pero el
    // mensaje deja claro que hay otra vía y que el derecho no se pierde.
    return (
      `Ya enviaste ${DAILY_FORM_SUBMISSION_LIMIT} solicitudes de arrepentimiento en las últimas 24 horas. ` +
      `Vas a poder enviar otra en ${wait}. Si necesitás hacerla antes, escribinos por WhatsApp o email: ` +
      'tu derecho de arrepentimiento no se pierde por esto.'
    );
  }
  return (
    `Ya enviaste ${DAILY_FORM_SUBMISSION_LIMIT} mensajes en las últimas 24 horas. ` +
    `Vas a poder enviar otro en ${wait}. Si es urgente, escribinos por WhatsApp.`
  );
}

export class DailyLimitExceededException extends HttpException {
  constructor(form: LimitedForm, retryAfterSeconds: number) {
    super(
      {
        message: limitMessage(form, retryAfterSeconds),
        code: DAILY_LIMIT_CODE,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Tope diario de envíos por visitante para los formularios públicos (contacto y botón de
 * arrepentimiento), pedido para que alguien malintencionado no pueda inundarlos.
 *
 * Distinto del límite por minuto de `ThrottlerGuard`: este se guarda en la base (sobrevive a
 * reinicios y deploys) y solo cuenta envíos ACEPTADOS - un error de validación o una falla al
 * mandar el mail no consumen un intento. Se usa en dos pasos desde el controller:
 * `assertCanSubmit` antes de procesar y `recordSubmission` cuando salió bien.
 */
@Injectable()
export class FormSubmissionLimitService {
  constructor(
    @InjectRepository(FormSubmission)
    private readonly submissionsRepository: Repository<FormSubmission>,
    private readonly configService: ConfigService,
  ) {}

  /** Tira `DailyLimitExceededException` (429) si este visitante ya llegó al tope. */
  async assertCanSubmit(form: LimitedForm, ip: string | undefined): Promise<void> {
    const now = Date.now();
    const recent = await this.submissionsRepository.find({
      where: {
        form,
        ipHash: this.hashIp(ip),
        createdAt: MoreThan(new Date(now - FORM_SUBMISSION_WINDOW_MS)),
      },
      order: { createdAt: 'ASC' },
    });
    if (recent.length < DAILY_FORM_SUBMISSION_LIMIT) return;

    // Se libera un lugar cuando el envío que hace sobrar el tope sale de la ventana.
    const freesAt = recent[recent.length - DAILY_FORM_SUBMISSION_LIMIT].createdAt.getTime() + FORM_SUBMISSION_WINDOW_MS;
    throw new DailyLimitExceededException(form, Math.max(1, Math.ceil((freesAt - now) / 1000)));
  }

  /** Registra un envío aceptado. De paso borra los registros que ya no sirven. */
  async recordSubmission(form: LimitedForm, ip: string | undefined): Promise<void> {
    const now = Date.now();
    await this.submissionsRepository.delete({ createdAt: LessThan(new Date(now - RETENTION_MS)) });
    // La fecha la pone la aplicación, no la base: así se compara siempre contra el mismo reloj
    // que usa `assertCanSubmit`.
    await this.submissionsRepository.save(
      this.submissionsRepository.create({ form, ipHash: this.hashIp(ip), createdAt: new Date(now) }),
    );
  }

  /** HMAC con un secreto del servidor: con solo la tabla no se puede volver a la IP (con un hash
   *  sin secreto alcanzaría con probar las ~4 mil millones de IPv4). */
  private hashIp(ip: string | undefined): string {
    const secret = this.configService.get<string>('auth.jwtSecret') ?? 'form-submission-limit';
    return createHmac('sha256', secret).update(ip ?? 'unknown').digest('hex');
  }
}
