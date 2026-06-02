// IMPORTANT: must be the first import so OpenTelemetry instrumentations
// patch http/express/nestjs BEFORE they are loaded below.
import './tracing/otel-bootstrap';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';

import { buildOpenApiConfig } from './openapi/build-openapi-config';

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

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.info(`API listening on http://localhost:${port}`);
  console.info(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
