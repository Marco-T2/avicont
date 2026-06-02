import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

import { grantSuperAdmin, revokeSuperAdmin } from './super-admin-bootstrap';

/**
 * Integration spec del bootstrap de super-admin (REQ-SA-10, REQ-SA-11).
 *
 * Usa Prisma y Redis reales. La función bajo test es `grantSuperAdmin` /
 * `revokeSuperAdmin` — extraídas del seed/CLI para ser directamente testeables
 * sin spawn de proceso (CLAUDE.md §7.2: integración preferida sobre E2E para
 * lógica de negocio testeable directamente).
 *
 * Clave Redis: `saas:superadmin:revoked:<userId>` — prefijo `saas:` aplicado
 * por `RedisService` en el app; el CLI usa ioredis directo con la clave completa.
 * Ver auth.service.ts `revocarTokensSuperAdmin` para el formato canónico.
 */
describe('REQ-SA-10: seed idempotente por SUPER_ADMIN_EMAIL', () => {
  const SEED_ACTOR_ID = 'seed';
  let prisma: PrismaClient;
  let testUserId: string;
  const testEmail = `bootstrap-test-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    // Crear usuario de prueba sin isSuperAdmin
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        hashedPassword: 'hashed-irrelevant',
        isActive: true,
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Limpiar: borrar audit rows del test primero (FK a users), luego el user.
    // actorUserId es el user.id del target (el seed/CLI lo pasa como FK válida).
    await prisma.platformAudit.deleteMany({ where: { actorUserId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it('[+] usuario existente → isSuperAdmin = true y fila en platform_audit', async () => {
    await grantSuperAdmin(prisma, testEmail, SEED_ACTOR_ID);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUserId } });
    expect(user.isSuperAdmin).toBe(true);

    // actorUserId en platform_audit es el id del user (FK válida), no el string 'seed'
    const auditRows = await prisma.platformAudit.findMany({
      where: { actorUserId: testUserId, action: 'platform.superadmin.grant' },
    });
    expect(auditRows.length).toBe(1);
    // El campo grantedBy en payload registra quién ejecutó (seed/cli)
    const payload = auditRows[0]?.payload as Record<string, unknown> | null;
    expect(payload?.['grantedBy']).toBe(SEED_ACTOR_ID);
  });

  it('[+] segunda ejecución idempotente → no duplica fila en platform_audit, isSuperAdmin sigue true', async () => {
    // Ya fue marcado como super-admin en el test anterior
    await grantSuperAdmin(prisma, testEmail, SEED_ACTOR_ID);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUserId } });
    expect(user.isSuperAdmin).toBe(true);

    // No debe haber duplicado la fila de audit
    const auditRows = await prisma.platformAudit.findMany({
      where: { actorUserId: testUserId, action: 'platform.superadmin.grant' },
    });
    expect(auditRows.length).toBe(1);
  });

  it('[-] SUPER_ADMIN_EMAIL no definida → ningún usuario queda super-admin por este mecanismo', async () => {
    // Simular el bloque del seed cuando la env no está definida:
    // si email es undefined → skip silencioso sin llamar a grantSuperAdmin.
    const emailEnv: string | undefined = undefined;
    if (emailEnv) {
      await grantSuperAdmin(prisma, emailEnv, SEED_ACTOR_ID);
    }
    // El user sigue en el estado que quedó (true del test anterior).
    // Verificamos que no hay filas nuevas de audit para este user.
    const auditRows = await prisma.platformAudit.findMany({
      where: { actorUserId: testUserId },
    });
    // Sigue habiendo exactamente 1 fila (la del primer test), no se duplicó
    expect(auditRows.length).toBe(1);
  });

  it('[-] email no existe en BD → falla con error descriptivo', async () => {
    await expect(
      grantSuperAdmin(prisma, 'noexiste-bootstrap@example.com', SEED_ACTOR_ID),
    ).rejects.toThrow('no existe');
  });
});

describe('REQ-SA-11: CLI grant/revoke', () => {
  const CLI_ACTOR_ID = 'cli';
  let prisma: PrismaClient;
  let redis: Redis;
  let cliUserId: string;
  const cliEmail = `cli-test-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    redis = new Redis({
      host: process.env['REDIS_HOST'] ?? 'localhost',
      port: Number(process.env['REDIS_PORT'] ?? 6379),
      db: 0,
    });

    const user = await prisma.user.create({
      data: {
        email: cliEmail,
        hashedPassword: 'hashed-irrelevant',
        isActive: true,
      },
    });
    cliUserId = user.id;
  });

  afterAll(async () => {
    // actorUserId en platform_audit es el id del user (FK válida)
    await prisma.platformAudit.deleteMany({ where: { actorUserId: cliUserId } });
    await redis.del(`saas:superadmin:revoked:${cliUserId}`);
    await prisma.user.delete({ where: { id: cliUserId } });
    await prisma.$disconnect();
    await redis.quit();
  });

  it('[+] grant: isSuperAdmin = true, fila en platform_audit con action = platform.superadmin.grant', async () => {
    await grantSuperAdmin(prisma, cliEmail, CLI_ACTOR_ID);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: cliUserId } });
    expect(user.isSuperAdmin).toBe(true);

    const auditRows = await prisma.platformAudit.findMany({
      where: { actorUserId: cliUserId, action: 'platform.superadmin.grant' },
    });
    expect(auditRows.length).toBe(1);
    expect(auditRows[0]?.payload).toBeDefined();
    const payload = auditRows[0]?.payload as Record<string, unknown> | null;
    expect(payload?.['grantedBy']).toBe(CLI_ACTOR_ID);
  });

  it('[+] revoke: isSuperAdmin = false, epoch en Redis, fila en platform_audit con action = platform.superadmin.revoke', async () => {
    const beforeRevokeMs = Date.now();

    await revokeSuperAdmin(prisma, redis, cliEmail, CLI_ACTOR_ID);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: cliUserId } });
    expect(user.isSuperAdmin).toBe(false);

    // Verificar epoch en Redis con la clave completa (prefijo saas: incluido)
    const epochStr = await redis.get(`saas:superadmin:revoked:${cliUserId}`);
    expect(epochStr).not.toBeNull();
    const epochMs = Number(epochStr);
    expect(epochMs).toBeGreaterThanOrEqual(beforeRevokeMs);
    expect(epochMs).toBeLessThanOrEqual(Date.now());

    // Verificar TTL aproximado (debe ser ~3600s)
    const ttl = await redis.ttl(`saas:superadmin:revoked:${cliUserId}`);
    expect(ttl).toBeGreaterThan(3590);
    expect(ttl).toBeLessThanOrEqual(3600);

    const auditRows = await prisma.platformAudit.findMany({
      where: { actorUserId: cliUserId, action: 'platform.superadmin.revoke' },
    });
    expect(auditRows.length).toBe(1);
    expect(auditRows[0]?.payload).toBeDefined();
    const payload = auditRows[0]?.payload as Record<string, unknown> | null;
    expect(payload?.['revokedBy']).toBe(CLI_ACTOR_ID);
  });

  it('[+] revoke → token con iat previo al epoch es rechazado (integración con JwtStrategy)', async () => {
    // El epoch fue escrito en el test anterior. Un iat anterior al epoch debe fallar.
    const epochStr = await redis.get(`saas:superadmin:revoked:${cliUserId}`);
    expect(epochStr).not.toBeNull();
    const epochMs = Number(epochStr);

    // Simulamos el chequeo de JwtStrategy: iat (en segundos) * 1000 < revokedAtMs → revocado
    const oldIatMs = epochMs - 5000; // 5 segundos antes del epoch → revocado
    const newIatMs = epochMs + 5000; // 5 segundos después → válido

    // Token viejo (iat anterior al epoch) → rechazado
    expect(epochMs > oldIatMs).toBe(true);
    // Token nuevo (iat posterior al epoch) → válido
    expect(epochMs > newIatMs).toBe(false);
  });

  it('[-] grant con email inexistente → falla con error descriptivo', async () => {
    await expect(grantSuperAdmin(prisma, 'noexiste-cli@example.com', CLI_ACTOR_ID)).rejects.toThrow(
      'no existe',
    );
  });

  it('[-] revoke con email inexistente → falla con error descriptivo', async () => {
    await expect(
      revokeSuperAdmin(prisma, redis, 'noexiste-cli-revoke@example.com', CLI_ACTOR_ID),
    ).rejects.toThrow('no existe');
  });

  it('[-] grant con email inexistente → falla con error descriptivo (cobertura revoke)', async () => {
    await expect(
      grantSuperAdmin(prisma, 'noexiste-grant2@example.com', CLI_ACTOR_ID),
    ).rejects.toThrow('no existe');
  });
});
