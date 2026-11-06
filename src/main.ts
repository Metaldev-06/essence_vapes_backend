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

  // API JSON pura - este origen nunca sirve HTML/script/estilos propios, así que la CSP no
  // necesita ninguna excepción tipo 'self': todo lo que un navegador pudiera intentar cargar
  // desde acá (script inyectado, imagen, iframe) queda bloqueado por default. `frame-ancestors:
  // 'none'` es el equivalente moderno (y más fuerte) de `X-Frame-Options: DENY`, que también se
  // setea explícito abajo para navegadores viejos que no entienden CSP Nivel 2.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'none'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          fontSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      xFrameOptions: { action: 'deny' },
      // Helmet fuerza este header a "0" por diseño (el auditor XSS de navegadores viejos es en
      // sí mismo un vector de ataque conocido) - se desactiva ese default para poder setearlo
      // manualmente abajo con el valor clásico de bloqueo, a pedido explícito.
      xXssProtection: false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
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
