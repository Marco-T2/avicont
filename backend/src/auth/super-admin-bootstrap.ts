import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

/**
 * TTL del epoch de revocación de super-admin en Redis.
 * Debe coincidir con la vida del access token (1h = 3600s).
 * Mismo valor que `SUPER_ADMIN_REVOCATION_TTL_SECONDS` en auth.service.ts.
 */
const REVOCATION_TTL_SECONDS = 3600;

/**
 * Prefijo de clave Redis que usa `RedisService` en la aplicación NestJS.
 * El CLI accede a Redis directamente (sin NestJS), por lo que debe incluir
 * el prefijo explícitamente para que JwtStrategy.validate() encuentre la misma clave.
 *
 * auth.service.ts usa RedisService que tiene `keyPrefix: 'saas:'`, por lo que
 * la clave real en Redis es `saas:superadmin:revoked:<userId>`.
 * Ver: cache/redis.service.ts constructor.
 */
const REDIS_KEY_PREFIX = 'saas:';

/**
 * Construye la clave Redis completa (con prefijo) para el epoch de revocación.
 * Canónica con `revocarTokensSuperAdmin` en auth.service.ts:
 *   - Clave base: `superadmin:revoked:<userId>`
 *   - Valor:      timestamp en ms como string
 *   - TTL:        3600s
 */
function superAdminRevocationKey(userId: string): string {
  return `${REDIS_KEY_PREFIX}superadmin:revoked:${userId}`;
}

/**
 * Asigna el privilegio de super-admin a un usuario existente y registra la
 * acción en `platform_audit`.
 *
 * Idempotente: si el usuario ya es super-admin, no escribe fila en audit
 * ni modifica nada — retorna silenciosamente.
 *
 * @param prisma - Instancia de PrismaClient ya conectada.
 * @param email  - Email del usuario a promover.
 * @param actorId - Identificador del actor para `platform_audit.actorUserId`.
 *                  Usar `'seed'` para el bloque del seed, `'cli'` para el script.
 * @throws {Error} Si el usuario con el email indicado no existe en la BD.
 */
export async function grantSuperAdmin(
  prisma: PrismaClient,
  email: string,
  actorId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new Error(
      `El usuario con email "${email}" no existe en la base de datos. ` +
        'Verificá que el usuario esté registrado antes de asignar el privilegio de super-admin.',
    );
  }

  // Idempotencia: si ya es super-admin, no duplicar fila en audit
  if (user.isSuperAdmin) {
    console.log(`[super-admin] ${email} ya es super-admin — no-op.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isSuperAdmin: true },
  });

  // Auditoría en platform_audit (REQ-SA-10, REQ-SA-09).
  // El actor es el proceso que ejecuta (seed o CLI), no un usuario del sistema.
  // actorUserId acepta el id del usuario actor o un identificador de sistema ('seed', 'cli').
  // Nota: platform_audit.actorUserId tiene FK a users(id) — para seed/CLI usamos
  // el id del mismo usuario promovido como actor de referencia (el target es también el actor
  // en el caso del primer super-admin). Alternativa: si se quiere trazar quién ejecutó el CLI,
  // pasar el userId del operador. En v1 el actor es el propio target (auto-bootstrap).
  await prisma.platformAudit.create({
    data: {
      actorUserId: user.id,
      action: 'platform.superadmin.grant',
      createdAt: new Date(),
      payload: {
        targetUserId: user.id,
        targetEmail: user.email,
        grantedBy: actorId,
      },
    },
  });

  console.log(`[super-admin] Privilegio otorgado a ${email}.`);
}

/**
 * Revoca el privilegio de super-admin de un usuario y:
 * 1. Escribe el epoch de revocación en Redis → invalida tokens activos (REQ-SA-03).
 * 2. Registra la acción en `platform_audit` (REQ-SA-09/11).
 *
 * El formato del epoch en Redis es idéntico al que escribe `revocarTokensSuperAdmin`
 * en `auth.service.ts` (clave `saas:superadmin:revoked:<userId>`, valor en ms como
 * string, TTL 3600s). `JwtStrategy.validate` usa ese mismo formato para rechazar
 * tokens con `iat` anterior al epoch.
 *
 * @param prisma - Instancia de PrismaClient ya conectada.
 * @param redis  - Cliente ioredis ya conectado (sin keyPrefix — la función lo añade).
 * @param email  - Email del usuario a revocar.
 * @param actorId - Identificador del actor para auditoría.
 * @throws {Error} Si el usuario con el email indicado no existe en la BD.
 */
export async function revokeSuperAdmin(
  prisma: PrismaClient,
  redis: Redis,
  email: string,
  actorId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new Error(
      `El usuario con email "${email}" no existe en la base de datos. ` +
        'Verificá que el email sea correcto antes de revocar el privilegio de super-admin.',
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isSuperAdmin: false },
  });

  // Epoch de revocación en Redis (REQ-SA-03, design.md Decisión 4.2).
  // El valor es el timestamp actual en ms como string — mismo formato que
  // AuthService.revocarTokensSuperAdmin() para que JwtStrategy.validate()
  // lo interprete correctamente: `revokedAtMs > iat * 1000 → UnauthorizedException`.
  // Se usa Date.now() directamente porque este es un script standalone, no domain/service
  // (la regla de ClockPort aplica a domain/*.ts y *.service.ts — CLAUDE.md §4.6).
  const nowMs = Date.now();
  const key = superAdminRevocationKey(user.id);
  await redis.setex(key, REVOCATION_TTL_SECONDS, String(nowMs));

  // Auditoría en platform_audit (REQ-SA-09/11).
  await prisma.platformAudit.create({
    data: {
      actorUserId: user.id,
      action: 'platform.superadmin.revoke',
      createdAt: new Date(),
      payload: {
        targetUserId: user.id,
        targetEmail: user.email,
        revokedBy: actorId,
        epochMs: nowMs,
      },
    },
  });

  console.log(`[super-admin] Privilegio revocado de ${email}. Tokens activos invalidados.`);
}
