import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import helmet from 'helmet';

import { AppModule } from './app.module';
import { LoggerHelper } from './common/helpers/logger.helper';
import securityConfig from './config/security.config';
import { translateValidationErrors } from './common/i18n/validation-messages';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const PORT = process.env.PORT ?? 3000;

  // `registerAs` factories se pueden llamar directo (sin DI) acá - mismo valor que el resto
  // de la app lee vía ConfigService (trustProxyHops por env var, corsAllowedOrigins
  // hardcodeado en ese archivo), sin duplicar nada.
  const security = securityConfig();

  // Detrás de Traefik (VPS propia con Dokploy, sin Cloudflare) hay exactamente 1 hop
  // confiable - así `request.ip` (usado por el throttler y por el bloqueo de IPs) refleja la
  // IP real del cliente en vez de la del proxy. Ver BACKEND_SECURITY.md.
  app.set('trust proxy', security.trustProxyHops);

  app.use(helmet());
  app.enableCors({ origin: security.corsAllowedOrigins, credentials: false });
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
