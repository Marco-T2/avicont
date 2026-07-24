/**
 * Restaura el catálogo global de packs (riel eje 2) sin correr el seed completo.
 *
 * Uso:
 *   pnpm seed:packs
 *
 * Variables de entorno:
 *   DATABASE_URL  — conexión a Postgres (requerida)
 *   REDIS_HOST    — host de Redis (default: localhost)
 *   REDIS_PORT    — puerto de Redis (default: 6379)
 *
 * Contexto: `Pack` es catálogo GLOBAL (seed data, sin `organizationId`), pero
 * `cleanupTestData()` lo borra junto con la data de test — ver
 * `test/helpers/test-factory.ts`. Como los E2E corren contra la misma base de
 * desarrollo (CLAUDE.md §11.3), toda corrida de `jest test/` deja el entorno
 * local sin packs y la UI de Complementos vacía. Este script recupera ese
 * estado en un comando, sin crear el usuario founder ni la org piloto que sí
 * crea `pnpm seed`.
 *
 * Invalida además el cache `saas:org-packs:<orgId>` que mantiene
 * `PackEnabledGuard` (TTL 300s): sin eso, la app sigue sirviendo la lista vacía
 * que cacheó antes del re-seed hasta por 5 minutos.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { seedPacksCatalogo, backfillOtorgamientoPorDefecto } from '../seeds/packs-catalogo';

// `RedisService` monta los clientes con `keyPrefix: 'saas:'`; acá conectamos
// crudo, así que la clave se escribe completa.
const PATRON_CACHE_PACKS = 'saas:org-packs:*';

async function invalidarCachePacks(redis: Redis): Promise<number> {
  const keys = await redis.keys(PATRON_CACHE_PACKS);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  let redis: Redis | null = null;

  try {
    await seedPacksCatalogo(prisma);
    await backfillOtorgamientoPorDefecto(prisma);

    const packs = await prisma.pack.findMany({ orderBy: { clave: 'asc' } });
    const entitlements = await prisma.orgPackEntitlement.findMany({
      include: {
        pack: { select: { clave: true } },
        organization: { select: { slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`✓ Catálogo de packs: ${packs.length}`);
    for (const pack of packs) {
      console.log(`  · ${pack.clave} (${pack.tipo}, defecto=${pack.otorgadoPorDefecto})`);
    }

    console.log(`✓ Entitlements por organización: ${entitlements.length}`);
    for (const ent of entitlements) {
      console.log(`  · ${ent.organization.slug} → ${ent.pack.clave} (activo=${ent.activo})`);
    }

    redis = new Redis({
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: Number(process.env['REDIS_PORT'] ?? 6379),
      db: 0,
      // Sin reintentos: si Redis no está, queremos el warning ya, no un cuelgue.
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    try {
      const borradas = await invalidarCachePacks(redis);
      console.log(`✓ Cache de packs invalidado (${borradas} clave/s)`);
    } catch {
      console.warn(
        '⚠ No se pudo invalidar el cache de packs (¿Redis apagado?). ' +
          'La app puede seguir sirviendo la lista anterior hasta 5 minutos.',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Error: ${message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    if (redis !== null) {
      redis.disconnect();
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error inesperado: ${message}`);
  process.exit(1);
});
