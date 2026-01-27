import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true }));

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Multi-Tenant SaaS API')
    .setDescription(
      'Production-ready NestJS API with multi-tenancy, authentication, RBAC, billing, and more.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Tenant-ID',
        in: 'header',
        description: 'Tenant ID for multi-tenant operations',
      },
      'X-Tenant-ID',
    )
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Tenants', 'Tenant/Organization management')
    .addTag('Users', 'User profile management')
    .addTag('Memberships', 'Team membership and invitations')
    .addTag('Feature Flags', 'Feature flag management')
    .addTag('Billing', 'Subscription and billing management')
    .addTag('Audit', 'Audit log queries')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  console.info(`API listening on http://localhost:${port}`);
  console.info(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
