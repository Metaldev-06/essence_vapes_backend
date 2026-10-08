import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';
import { LoggerHelper } from './common/helpers/logger.helper';
import { translateValidationErrors } from './common/i18n/validation-messages';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.PORT ?? 3000;

  app.enableCors();
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // All user-facing feedback must be in Spanish - class-validator's default messages
      // are English, so every DTO's validation errors are translated here in one place.
      exceptionFactory: (errors) =>
        new BadRequestException(translateValidationErrors(errors)),
    }),
  );

  await app.listen(PORT);

  LoggerHelper(
    `Server running on http://localhost:${PORT}/api/v1`,
    'Bootstrap',
  );
}
void bootstrap();
