import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { QueryFailedError } from 'typeorm';

import { LoggerHelper } from './logger.helper';

const UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed: \w+\.(\w+)/;

export const HandleDBExceptions = (error: any, ctx: string): never => {
  const dbError = error as { code?: string; detail?: string };

  if (dbError.code === '23505') {
    throw new BadRequestException(dbError.detail);
  }

  // Verifica si el error es un QueryFailedError (usado por TypeORM)
  if (error instanceof QueryFailedError) {
    // Maneja el caso específico de SQLite para restricciones únicas.
    // better-sqlite3 reporta "UNIQUE constraint failed: users.email"
    // con code "SQLITE_CONSTRAINT_UNIQUE".
    const uniqueConstraint = UNIQUE_CONSTRAINT_PATTERN.exec(error.message);
    if (uniqueConstraint) {
      throw new BadRequestException(
        `The value for "${uniqueConstraint[1]}" already exists in the database`,
      );
    }

    if (error.message.includes('UNIQUE constraint failed')) {
      throw new BadRequestException('The value already exists in the database');
    }
  }

  LoggerHelper(error, ctx, true);

  throw new InternalServerErrorException('Unexpected error, check server logs');
};
