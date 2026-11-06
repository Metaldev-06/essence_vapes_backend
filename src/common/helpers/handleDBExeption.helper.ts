import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { QueryFailedError } from 'typeorm';

import { LoggerHelper } from './logger.helper';

const UNIQUE_CONSTRAINT_PATTERN = /UNIQUE constraint failed: \w+\.(\w+)/;

export const HandleDBExceptions = (error: any, ctx: string): never => {
  const dbError = error as { code?: string };

  // Rama de compatibilidad con Postgres (better-sqlite3 nunca reporta code "23505" - usa
  // QueryFailedError + "UNIQUE constraint failed", manejado abajo). A propósito NO reenvía
  // `dbError.detail` crudo al cliente (podía filtrar detalle interno de la DB) - mismo mensaje
  // genérico que el resto de los casos de restricción única.
  if (dbError.code === '23505') {
    throw new BadRequestException('El valor ya existe en la base de datos');
  }

  // Verifica si el error es un QueryFailedError (usado por TypeORM)
  if (error instanceof QueryFailedError) {
    // Maneja el caso específico de SQLite para restricciones únicas.
    // better-sqlite3 reporta "UNIQUE constraint failed: users.email"
    // con code "SQLITE_CONSTRAINT_UNIQUE".
    const uniqueConstraint = UNIQUE_CONSTRAINT_PATTERN.exec(error.message);
    if (uniqueConstraint) {
      throw new BadRequestException(
        `El valor de "${uniqueConstraint[1]}" ya existe en la base de datos`,
      );
    }

    if (error.message.includes('UNIQUE constraint failed')) {
      throw new BadRequestException('El valor ya existe en la base de datos');
    }
  }

  LoggerHelper(error, ctx, true);

  throw new InternalServerErrorException(
    'Ocurrió un error inesperado, revisá los registros del servidor',
  );
};
