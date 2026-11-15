import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { LimitedForm } from '../../features/security/entities/form-submission.entity';
import { DailyLimitExceededException } from '../../features/security/form-submission-limit.service';
import { GlobalExceptionFilter } from './global-exception.filter';

function setup(headers: Record<string, unknown> = {}) {
  const json = jest.fn();
  const response = {
    status: jest.fn().mockReturnValue({ json }),
    getHeader: (name: string) => headers[name],
  };
  const request = {
    method: 'GET',
    path: '/api/v1/products',
    id: 'req-1',
    ip: '1.2.3.4',
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };
  const filter = new GlobalExceptionFilter({ record: jest.fn() } as never);
  return { filter, host: host as never, response, json };
}

describe('GlobalExceptionFilter - límite de solicitudes (429)', () => {
  beforeEach(() =>
    jest.spyOn(console, 'log').mockImplementation(() => undefined),
  );
  afterEach(() => jest.restoreAllMocks());

  it('responde en español e informa los segundos reales que faltan (del header Retry-After)', () => {
    const { filter, host, response, json } = setup({ 'Retry-After': 42 });

    filter.catch(new ThrottlerException(), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      message: expect.stringContaining('muchas solicitudes'),
      retryAfterSeconds: 42,
      requestId: 'req-1',
    });
  });

  it('acepta el header como texto o lista', () => {
    const asText = setup({ 'Retry-After': '17' });
    asText.filter.catch(new ThrottlerException(), asText.host);
    expect(asText.json.mock.calls[0][0].retryAfterSeconds).toBe(17);

    const asList = setup({ 'Retry-After': ['9'] });
    asList.filter.catch(new ThrottlerException(), asList.host);
    expect(asList.json.mock.calls[0][0].retryAfterSeconds).toBe(9);
  });

  it('sin header, retryAfterSeconds es null (el front usa su propio valor por defecto)', () => {
    const { filter, host, json } = setup();

    filter.catch(new ThrottlerException(), host);

    expect(json.mock.calls[0][0].retryAfterSeconds).toBeNull();
  });

  it('el tope diario de formularios conserva su propio mensaje, código y tiempo', () => {
    const { filter, host, response, json } = setup({ 'Retry-After': 42 });

    filter.catch(new DailyLimitExceededException(LimitedForm.CONTACT, 3_600), host);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      message: expect.stringContaining('Ya enviaste 2 mensajes'),
      code: 'DAILY_LIMIT_REACHED',
      retryAfterSeconds: 3_600,
      requestId: 'req-1',
    });
  });

  it('los demás errores no cambian', () => {
    const { filter, host, json } = setup({ 'Retry-After': 42 });

    filter.catch(new BadRequestException('Dato inválido'), host);

    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'Dato inválido',
      requestId: 'req-1',
    });
  });
});
