/**
 * CLI de administración de super-admins de plataforma.
 *
 * Uso:
 *   pnpm super-admin grant <email>
 *   pnpm super-admin revoke <email>
 *
 * Variables de entorno:
 *   DATABASE_URL  — conexión a Postgres (requerida)
 *   REDIS_HOST    — host de Redis (default: localhost)
 *   REDIS_PORT    — puerto de Redis (default: 6379)
 *
 * Contexto: este script resuelve el problema huevo-gallina del primer super-admin
 * (design.md Decisión 8, REQ-SA-11). No levanta NestJS; conecta directo a Postgres
 * (Prisma) y Redis (ioredis) para mantener el arranque liviano.
 *
 * El epoch de revocación de Redis usa el mismo formato que `AuthService.revocarTokensSuperAdmin`:
 *   clave: `saas:revoked:access:<userId>` (prefijo `saas:` explícito)
 *   valor: timestamp en ms como string
 *   TTL:   3600s (vida del access token)
 * `JwtStrategy.validate` en el app NestJS usa ese mismo formato para invalidar tokens.
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { grantSuperAdmin, revokeSuperAdmin } from '../../src/auth/super-admin-bootstrap';

async function main(): Promise<void> {
  const [, , accion, email] = process.argv;

  if (!accion || !email) {
    console.error('Uso: pnpm super-admin <grant|revoke> <email>');
    process.exit(1);
  }

  if (accion !== 'grant' && accion !== 'revoke') {
    console.error(`Acción inválida: "${accion}". Debe ser "grant" o "revoke".`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  let redis: Redis | null = null;

  try {
    if (accion === 'grant') {
      await grantSuperAdmin(prisma, email, 'cli');
      console.log(`✓ Super-admin otorgado a ${email}`);
    } else {
      // revoke: requiere Redis para invalidar tokens activos (REQ-SA-03)
      redis = new Redis({
        host: process.env['REDIS_HOST'] ?? 'localhost',
        port: Number(process.env['REDIS_PORT'] ?? 6379),
        db: 0,
      });
      await revokeSuperAdmin(prisma, redis, email, 'cli');
      console.log(`✓ Super-admin revocado de ${email}. Tokens activos invalidados.`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Error: ${message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    if (redis !== null) {
      await redis.quit();
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error inesperado: ${message}`);
  process.exit(1);
});
