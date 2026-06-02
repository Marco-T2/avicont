import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Construye la configuración OpenAPI (DocumentBuilder.build()) compartida entre
 * `main.ts` (Swagger UI en `/docs`) y `scripts/dump-openapi.ts` (artefacto
 * `openapi.json`). Única fuente de verdad de título, versión, security y tags
 * para evitar drift entre el doc servido y el dumpeado.
 */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
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
}
