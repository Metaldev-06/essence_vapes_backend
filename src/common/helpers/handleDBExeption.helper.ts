import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { QueryFailedError } from 'typeorm';

import { LoggerHelper } from './logger.helper';

export const HandleDBExceptions = (error: any, ctx: string): never => {
  const dbError = error as { code?: string; detail?: string };

  if (dbError.code === '23505') {
    throw new BadRequestException(dbError.detail);
  }

  // Verifica si el error es un QueryFailedError (usado por TypeORM)
  if (error instanceof QueryFailedError) {
    // Maneja el caso específico de SQLite para restricciones únicas
    if (error.message.includes('SQLITE_CONSTRAINT: UNIQUE constraint failed')) {
      throw new BadRequestException('The value already exists in the database');
    }
  }

  LoggerHelper(error, ctx, true);

  throw new InternalServerErrorException('Unexpected error, check server logs');
};
