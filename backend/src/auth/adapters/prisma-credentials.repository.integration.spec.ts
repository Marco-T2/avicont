import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

import { PrismaCredentialsRepository } from './prisma-credentials.repository';

/**
 * Integration spec del adapter de credenciales (REQ-LA-04).
 * Usa Postgres real. Verifica el comportamiento de revokeAllByUserId.
 */
describe('REQ-LA-04: revokeAllByUserId', () => {
  // Accedemos directamente a Prisma para setup/teardown (CLAUDE.md §7.2)
  let prismaClient: PrismaClient;
  let repo: PrismaCredentialsRepository;
  let userId: string;
  let otherUserId: string;

  function makeHash(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  beforeAll(async () => {
    prismaClient = new PrismaClient();

    // Crear dos usuarios de prueba
    const user = await prismaClient.user.create({
      data: {
        email: `credentials-test-${Date.now()}@example.com`,
        hashedPassword: 'irrelevant',
        isActive: true,
      },
    });
    const otherUser = await prismaClient.user.create({
      data: {
        email: `credentials-other-${Date.now()}@example.com`,
        hashedPassword: 'irrelevant',
        isActive: true,
      },
    });
    userId = user.id;
    otherUserId = otherUser.id;

    // PrismaService extiende PrismaClient; para el adapter solo se usa prismaClient.refreshToken,
    // por lo que podemos pasar el PrismaClient directamente casteado (CLAUDE.md §7.2).
    repo = new PrismaCredentialsRepository(
      prismaClient as unknown as import('@/common/prisma.service').PrismaService,
    );
  });

  afterAll(async () => {
    // Limpieza: borrar tokens creados por los tests, luego los usuarios
    await prismaClient.refreshToken.deleteMany({
      where: { userId: { in: [userId, otherUserId] } },
    });
    await prismaClient.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prismaClient.$disconnect();
  });

  beforeEach(async () => {
    // Limpiar tokens entre tests
    await prismaClient.refreshToken.deleteMany({
      where: { userId: { in: [userId, otherUserId] } },
    });
  });

  it('revoca todos los refresh tokens activos del usuario', async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Crear 3 tokens activos en distintas familias
    const family1 = crypto.randomUUID();
    const family2 = crypto.randomUUID();
    const family3 = crypto.randomUUID();

    await prismaClient.refreshToken.createMany({
      data: [
        { tokenHash: makeHash(), userId, familyId: family1, expiresAt },
        { tokenHash: makeHash(), userId, familyId: family2, expiresAt },
        { tokenHash: makeHash(), userId, familyId: family3, expiresAt },
      ],
    });

    await repo.revokeAllByUserId(userId, 'logout-all');

    const tokens = await prismaClient.refreshToken.findMany({ where: { userId } });
    expect(tokens).toHaveLength(3);
    for (const token of tokens) {
      expect(token.revokedAt).not.toBeNull();
      expect(token.revokedReason).toBe('logout-all');
    }
  });

  it('no re-revoca los ya revocados ni toca otros usuarios', async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const originalRevokedAt = new Date('2026-01-01T00:00:00.000Z');

    // Un token ya revocado del usuario (con revokedAt original)
    await prismaClient.refreshToken.create({
      data: {
        tokenHash: makeHash(),
        userId,
        familyId: crypto.randomUUID(),
        expiresAt,
        revokedAt: originalRevokedAt,
        revokedReason: 'rotated',
      },
    });

    // Un token activo del otro usuario
    await prismaClient.refreshToken.create({
      data: {
        tokenHash: makeHash(),
        userId: otherUserId,
        familyId: crypto.randomUUID(),
        expiresAt,
      },
    });

    await repo.revokeAllByUserId(userId, 'logout-all');

    // El token ya revocado del usuario conserva su revokedAt original
    const userTokens = await prismaClient.refreshToken.findMany({ where: { userId } });
    expect(userTokens).toHaveLength(1);
    // revokedAt no debe cambiar (era ya revocado)
    expect(userTokens[0]?.revokedAt?.toISOString()).toBe(originalRevokedAt.toISOString());
    expect(userTokens[0]?.revokedReason).toBe('rotated');

    // El token del otro usuario sigue intacto
    const otherTokens = await prismaClient.refreshToken.findMany({
      where: { userId: otherUserId },
    });
    expect(otherTokens).toHaveLength(1);
    expect(otherTokens[0]?.revokedAt).toBeNull();
  });
});
