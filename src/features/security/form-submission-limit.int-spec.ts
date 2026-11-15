import { HttpStatus } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { ContactController } from '../contact/contact.controller';
import { WithdrawalRequestsController } from '../withdrawal-requests/withdrawal-requests.controller';
import { FormSubmission, LimitedForm } from './entities/form-submission.entity';
import {
  DAILY_FORM_SUBMISSION_LIMIT,
  DAILY_LIMIT_CODE,
  DailyLimitExceededException,
  FORM_SUBMISSION_WINDOW_MS,
  FormSubmissionLimitService,
  formatWait,
} from './form-submission-limit.service';

/**
 * Tope diario de los formularios públicos contra una base SQLite EN MEMORIA (nunca toca
 * essence-vapes.sqlite).
 */
describe('Tope diario de formularios públicos', () => {
  let dataSource: DataSource;
  let repository: Repository<FormSubmission>;
  let service: FormSubmissionLimitService;
  const START = Date.UTC(2026, 10, 15, 15, 0, 0);

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(START);
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [FormSubmission],
      synchronize: true,
    });
    await dataSource.initialize();
    repository = dataSource.getRepository(FormSubmission);
    service = new FormSubmissionLimitService(repository, { get: () => 'secreto-de-prueba' } as never);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await dataSource.destroy();
  });

  async function submit(form: LimitedForm, ip: string): Promise<void> {
    await service.assertCanSubmit(form, ip);
    await service.recordSubmission(form, ip);
  }

  async function rejection(form: LimitedForm, ip: string): Promise<DailyLimitExceededException> {
    try {
      await service.assertCanSubmit(form, ip);
    } catch (error) {
      return error as DailyLimitExceededException;
    }
    throw new Error('Se esperaba que el envío fuera rechazado');
  }

  it(`deja enviar ${DAILY_FORM_SUBMISSION_LIMIT} veces y rechaza la siguiente con 429 y un mensaje claro`, async () => {
    await submit(LimitedForm.CONTACT, '1.1.1.1');
    jest.setSystemTime(START + 60 * 60 * 1000);
    await submit(LimitedForm.CONTACT, '1.1.1.1');

    const error = await rejection(LimitedForm.CONTACT, '1.1.1.1');

    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    const body = error.getResponse() as { message: string; code: string; retryAfterSeconds: number };
    expect(body.code).toBe(DAILY_LIMIT_CODE);
    expect(body.message).toContain('Ya enviaste 2 mensajes en las últimas 24 horas');
    // El primero fue hace 1 h: se libera un lugar dentro de 23 h.
    expect(body.retryAfterSeconds).toBe(23 * 60 * 60);
    expect(body.message).toContain('23 h');
  });

  it('a las 24 horas del primer envío se libera un lugar (ventana móvil)', async () => {
    await submit(LimitedForm.CONTACT, '1.1.1.1');
    await submit(LimitedForm.CONTACT, '1.1.1.1');

    jest.setSystemTime(START + FORM_SUBMISSION_WINDOW_MS + 1_000);

    await expect(service.assertCanSubmit(LimitedForm.CONTACT, '1.1.1.1')).resolves.toBeUndefined();
  });

  it('cada visitante (IP) tiene su propio tope', async () => {
    await submit(LimitedForm.CONTACT, '1.1.1.1');
    await submit(LimitedForm.CONTACT, '1.1.1.1');

    await expect(service.assertCanSubmit(LimitedForm.CONTACT, '2.2.2.2')).resolves.toBeUndefined();
  });

  it('contacto y arrepentimiento se cuentan por separado', async () => {
    await submit(LimitedForm.CONTACT, '1.1.1.1');
    await submit(LimitedForm.CONTACT, '1.1.1.1');

    await expect(service.assertCanSubmit(LimitedForm.WITHDRAWAL, '1.1.1.1')).resolves.toBeUndefined();
  });

  it('el aviso del arrepentimiento ofrece otra vía y aclara que el derecho no se pierde', async () => {
    await submit(LimitedForm.WITHDRAWAL, '1.1.1.1');
    await submit(LimitedForm.WITHDRAWAL, '1.1.1.1');

    const { message } = (await rejection(LimitedForm.WITHDRAWAL, '1.1.1.1')).getResponse() as { message: string };

    expect(message).toContain('solicitudes de arrepentimiento');
    expect(message).toContain('no se pierde');
  });

  it('no guarda la IP tal cual, y borra los registros viejos', async () => {
    await submit(LimitedForm.CONTACT, '1.1.1.1');
    const [row] = await repository.find();
    expect(row.ipHash).not.toContain('1.1.1.1');
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);

    jest.setSystemTime(START + 3 * FORM_SUBMISSION_WINDOW_MS);
    await submit(LimitedForm.CONTACT, '2.2.2.2');

    expect(await repository.count()).toBe(1);
  });

  describe('en los controllers', () => {
    it('contacto: si el mail no se pudo enviar, el intento NO cuenta', async () => {
      const contactService = { send: jest.fn().mockRejectedValue(new Error('Resend caído')) };
      const controller = new ContactController(contactService as never, service);

      await expect(controller.create({} as never, '1.1.1.1')).rejects.toThrow('Resend caído');
      await expect(controller.create({} as never, '1.1.1.1')).rejects.toThrow('Resend caído');

      contactService.send.mockResolvedValue(undefined);
      await controller.create({} as never, '1.1.1.1');
      await controller.create({} as never, '1.1.1.1');
      await expect(controller.create({} as never, '1.1.1.1')).rejects.toBeInstanceOf(DailyLimitExceededException);
      expect(contactService.send).toHaveBeenCalledTimes(4);
    });

    it('arrepentimiento: al llegar al tope no crea la solicitud', async () => {
      const withdrawalService = { create: jest.fn().mockResolvedValue({ trackingCode: 'ARR-1' }) };
      const controller = new WithdrawalRequestsController(withdrawalService as never, service);

      await expect(controller.create({} as never, '1.1.1.1')).resolves.toEqual({ trackingCode: 'ARR-1' });
      await controller.create({} as never, '1.1.1.1');
      await expect(controller.create({} as never, '1.1.1.1')).rejects.toBeInstanceOf(DailyLimitExceededException);

      expect(withdrawalService.create).toHaveBeenCalledTimes(2);
    });
  });
});

describe('formatWait', () => {
  it('muestra horas y minutos redondeando hacia arriba', () => {
    expect(formatWait(30)).toBe('1 min');
    expect(formatWait(45 * 60)).toBe('45 min');
    expect(formatWait(5 * 3600)).toBe('5 h');
    expect(formatWait(5 * 3600 + 20 * 60)).toBe('5 h 20 min');
    expect(formatWait(23 * 3600 + 59 * 60 + 1)).toBe('24 h');
  });
});
