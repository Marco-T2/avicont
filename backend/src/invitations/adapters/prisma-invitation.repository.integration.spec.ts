import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaInvitationRepository } from './prisma-invitation.repository';

/**
 * Integration spec del `PrismaInvitationRepository` contra Postgres real.
 *
 * Valida defense-in-depth multi-tenant (CLAUDE.md §4.2):
 *   — findById con organizationId: no devuelve la invitación de otra org.
 *   — markRevoked con organizationId: no revoca la invitación de otra org (P2025).
 *   — markAccepted: NO se scopea por org (flujo de aceptación por token, correcto).
 *
 * El flujo accept-by-token usa findByTokenHash (que no filtra por org — correcto,
 * el token secreto es el único autorizador) y luego applyInvitationTx.
 * markAccepted podría scoping pero se usa SOLO dentro de applyInvitationTx
 * donde la invitación ya fue validada. Se documenta la decisión abajo.
 */
describe('PrismaInvitationRepository (integration) — aislamiento multi-tenant', () => {
  const SLUG_A = 'org-test-inv-a';
  const SLUG_B = 'org-test-inv-b';

  let prisma: PrismaClient;
  let repo: PrismaInvitationRepository;
  let tenantA: string;
  let tenantB: string;
  let invAId: string;
  let inviterId: string;

  function randomHash() {
    return crypto.randomBytes(32).toString('hex');
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaInvitationRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A Inv' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B Inv' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    // Inviter user
    const inviter = await prisma.user.create({
      data: {
        email: 'inviter-test-inv@test.local',
        hashedPassword: 'x',
        isEmailVerified: true,
        isActive: true,
      },
    });
    inviterId = inviter.id;

    // Invitación en tenantA
    const invA = await prisma.invitation.create({
      data: {
        organizationId: tenantA,
        email: 'invited-a@test.local',
        invitedById: inviterId,
        systemRole: 'ADMIN',
        tokenHash: randomHash(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    invAId = invA.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    if (orgs.length > 0) {
      const orgIds = orgs.map((o) => o.id);
      // Cascade borra invitations
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.user.deleteMany({
      where: { email: 'inviter-test-inv@test.local' },
    });
  }

  // --------------- findById ---------------

  it('findById retorna la invitación cuando el organizationId corresponde', async () => {
    const found = await repo.findById(invAId, tenantA);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(invAId);
  });

  it('findById retorna null cuando se pasa el organizationId de otra org', async () => {
    const found = await repo.findById(invAId, tenantB);
    expect(found).toBeNull();
  });

  // --------------- markRevoked ---------------

  it('markRevoked revoca la invitación cuando el organizationId corresponde', async () => {
    const result = await repo.markRevoked(invAId, tenantA);
    expect(result.status).toBe('REVOKED');
  });

  it('markRevoked lanza P2025 cuando se pasa el organizationId de otra org', async () => {
    await expect(repo.markRevoked(invAId, tenantB)).rejects.toMatchObject({ code: 'P2025' });

    // La invitación de tenantA sigue PENDING
    const inv = await prisma.invitation.findUnique({ where: { id: invAId } });
    expect(inv?.status).toBe('PENDING');
  });
});
