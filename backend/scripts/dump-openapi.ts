/**
 * Dump del documento OpenAPI a `backend/openapi.json` SIN levantar un servidor HTTP.
 *
 * `NestFactory.create` instancia el contexto Nest pero NO abre un puerto (solo
 * `app.listen()` lo hace). Por eso se puede construir el documento Swagger tras
 * `create()` y cerrar la app inmediatamente — sin handles colgados.
 *
 * Usa la MISMA config (`buildOpenApiConfig`) y el MISMO `setGlobalPrefix('api')`
 * que `src/main.ts` para que el contrato dumpeado coincida byte-a-byte con el
 * doc servido en `/docs`.
 *
 * Requiere la infra que el `AppModule` conecta en bootstrap (Postgres vía Prisma,
 * Redis vía cache). En CI corre en el job `contract-drift` con esos services arriba.
 *   DATABASE_URL — conexión a Postgres (requerida)
 *   REDIS_HOST   — host de Redis (default: localhost)
 *
 * El JSON se serializa con 2 espacios y newline final para que el diff del gate
 * de CI sea estable y legible.
 */
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { AppModule } from '../src/app.module';
import { buildOpenApiConfig } from '../src/openapi/build-openapi-config';

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');

  const document = SwaggerModule.createDocument(app, buildOpenApiConfig());

  const out = join(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(document, null, 2) + '\n', 'utf8');

  await app.close();
  console.info(`OpenAPI document written to ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
