import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

import { describe, expect, it } from '@jest/globals';

import { HandleDBExceptions } from './handleDBExeption.helper';

describe('HandleDBExceptions', () => {
  it('nunca reenvía el detalle crudo de un error estilo Postgres (code 23505) al cliente', () => {
    const fakeError = { code: '23505', detail: 'Key (email)=(secreto@interno.db) already exists' };

    let thrown: unknown;
    try {
      HandleDBExceptions(fakeError, 'test');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    const message = JSON.stringify((thrown as BadRequestException).getResponse());
    expect(message).not.toContain('secreto@interno.db');
  });

  it('un error no controlado nunca expone su mensaje real al cliente', () => {
    const fakeError = new Error('ENOENT: /var/secrets/credentials.json no existe');

    let thrown: unknown;
    try {
      HandleDBExceptions(fakeError, 'test');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InternalServerErrorException);
    const message = JSON.stringify((thrown as InternalServerErrorException).getResponse());
    expect(message).not.toContain('/var/secrets/credentials.json');
  });
});
