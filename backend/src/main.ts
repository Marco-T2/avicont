// IMPORTANT: must be the first import so OpenTelemetry instrumentations
// patch http/express/nestjs BEFORE they are loaded below.
import './tracing/otel-bootstrap';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';

import { buildOpenApiConfig } from './openapi/build-openapi-config';
// Import aparte del side-effect de arriba a propósito: fusionarlos volvería
// reordenable la línea 3, y el SDK debe iniciarse antes que el resto.
import { shutdownTracing } from './tracing/otel-bootstrap';

/**
 * Registra el apagado ante SIGTERM/SIGINT.
 *
 * Registrar un handler de señal SUPRIME el comportamiento por defecto de Node,
 * que es terminar el proceso. Si el handler no llama a `process.exit`, el
 * servidor HTTP sigue siendo un handle activo del event loop y el proceso
 * SOBREVIVE a la señal: queda escuchando el puerto con el código viejo en
 * memoria. `nest start --watch` le manda SIGTERM antes de relanzar, así que
 * todo reinicio del watcher falla con EADDRINUSE y los cambios nunca llegan a
 * la app (ver CLAUDE.md §11.7).
 *
 * `app.close()` dispara los hooks de ciclo de vida — entre ellos
 * `PrismaService.onModuleDestroy`, que desconecta el pool.
 */
function registrarApagadoOrdenado(app: INestApplication): void {
  let apagando = false;

  const apagar = (senal: NodeJS.Signals): void => {
    if (apagando) return;
    apagando = true;

    void (async () => {
      try {
        await app.close();
        await shutdownTracing();
      } catch (err) {
        console.error(`[shutdown] error durante el apagado (${senal}):`, err);
      } finally {
        process.exit(0);
      }
    })();
  };

  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  // CORS con credentials — la cookie refreshToken (httpOnly, SameSite=Strict)
  // necesita `credentials: true` y un origin explícito (no wildcard).
  // En dev, el frontend corre en :5173 (Vite). En prod se usa FRONTEND_URL.
  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  // cookie-parser se registra dentro de AppModule.configure() para que
  // también se aplique en los tests E2E (Test.createTestingModule no ejecuta
  // el main.ts). Dejamos esto aquí como referencia — si hiciera falta
  // configuración por env, pasaría el secret via ConfigService.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true }));

  // Swagger Documentation — config compartida con scripts/dump-openapi.ts
  const config = buildOpenApiConfig();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  registrarApagadoOrdenado(app);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.info(`API listening on http://localhost:${port}`);
  console.info(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
