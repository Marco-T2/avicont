import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCustomRoleRepository } from './prisma-custom-role.repository';

/**
 * Integration spec del `PrismaCustomRoleRepository` contra Postgres real.
 *
 * Valida defense-in-depth multi-tenant (CLAUDE.md §4.2):
 *   — findById con organizationId: no devuelve el rol de otra org.
 *   — update con organizationId: no afecta el rol de otra org (P2025).
 *   — delete con organizationId: no elimina el rol de otra org (P2025).
 *   — countActiveMembers: cuenta solo memberships del tenant correcto.
 *   — listAffectedUserIds: devuelve solo userIds del tenant correcto.
 *   — listMembersWithUsers: devuelve solo miembros del tenant correcto.
 */
describe('PrismaCustomRoleRepository (integration) — aislamiento multi-tenant', () => {
  const SLUG_A = 'org-test-crrepo-a';
  const SLUG_B = 'org-test-crrepo-b';

  let prisma: PrismaClient;
  let repo: PrismaCustomRoleRepository;
  let tenantA: string;
  let tenantB: string;
  let roleAId: string;
  let roleBId: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaCustomRoleRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A CR' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B CR' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const [roleA, roleB] = await Promise.all([
      prisma.customRole.create({
        data: { organizationId: tenantA, slug: 'contador-a', name: 'Contador A', permissions: [] },
      }),
      prisma.customRole.create({
        data: { organizationId: tenantB, slug: 'contador-b', name: 'Contador B', permissions: [] },
      }),
    ]);
    roleAId = roleA.id;
    roleBId = roleB.id;

    const [userA, userB] = await Promise.all([
      prisma.user.create({
        data: {
          email: `user-a-crrepo@test.local`,
          hashedPassword: 'x',
          isEmailVerified: true,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          email: `user-b-crrepo@test.local`,
          hashedPassword: 'x',
          isEmailVerified: true,
          isActive: true,
        },
      }),
    ]);
    userAId = userA.id;
    userBId = userB.id;

    // Membership del userA en tenantA con roleA
    await prisma.membership.create({
      data: { organizationId: tenantA, userId: userAId, customRoleId: roleAId },
    });
    // Membership del userB en tenantB con roleB
    await prisma.membership.create({
      data: { organizationId: tenantB, userId: userBId, customRoleId: roleBId },
    });
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    if (orgs.length === 0) return;
    const orgIds = orgs.map((o) => o.id);
    // Cascade borra memberships, invitations, periodos, etc.
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    // Users no tienen cascade desde organization — limpiar por email
    await prisma.user.deleteMany({
      where: { email: { in: ['user-a-crrepo@test.local', 'user-b-crrepo@test.local'] } },
    });
  }

  // --------------- findById ---------------

  it('findById retorna el rol cuando el organizationId corresponde', async () => {
    const found = await repo.findById(roleAId, tenantA);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(roleAId);
  });

  it('findById retorna null cuando se pasa el organizationId de otra org', async () => {
    // roleA pertenece a tenantA; pasando tenantB debe devolver null
    const found = await repo.findById(roleAId, tenantB);
    expect(found).toBeNull();
  });

  // --------------- update ---------------

  it('update modifica el rol cuando el organizationId corresponde', async () => {
    const updated = await repo.update(roleAId, tenantA, { name: 'Contador A Modificado' });
    expect(updated.name).toBe('Contador A Modificado');
  });

  it('update lanza P2025 cuando se pasa el organizationId de otra org', async () => {
    // roleA en tenantA, pasando tenantB -> Prisma no encuentra el registro -> P2025
    await expect(repo.update(roleAId, tenantB, { name: 'Hack' })).rejects.toMatchObject({
      code: 'P2025',
    });
  });

  // --------------- delete ---------------

  it('delete elimina el rol cuando el organizationId corresponde', async () => {
    // Primero desactivar la membership para que no haya FK conflict
    await prisma.membership.updateMany({
      where: { customRoleId: roleAId },
      data: { customRoleId: null },
    });
    await expect(repo.delete(roleAId, tenantA)).resolves.toBeUndefined();
    const found = await prisma.customRole.findUnique({ where: { id: roleAId } });
    expect(found).toBeNull();
  });

  it('delete lanza P2025 cuando se pasa el organizationId de otra org', async () => {
    // Desactivar membership para no confundir con FK error
    await prisma.membership.updateMany({
      where: { customRoleId: roleAId },
      data: { customRoleId: null },
    });
    await expect(repo.delete(roleAId, tenantB)).rejects.toMatchObject({ code: 'P2025' });
  });

  // --------------- countActiveMembers ---------------

  it('countActiveMembers filtra por organizationId — no cuenta miembros de otra org', async () => {
    // roleBId pertenece a tenantB; cuando preguntamos por tenantA → 0
    const countCrossOrg = await repo.countActiveMembers(roleBId, tenantA);
    expect(countCrossOrg).toBe(0);

    // roleAId en tenantA → 1 (userA)
    const countOwnOrg = await repo.countActiveMembers(roleAId, tenantA);
    expect(countOwnOrg).toBe(1);
  });

  // --------------- listAffectedUserIds ---------------

  it('listAffectedUserIds filtra por organizationId — no devuelve userIds de otra org', async () => {
    // roleBId en tenantB; preguntando por tenantA → []
    const crossOrg = await repo.listAffectedUserIds(roleBId, tenantA);
    expect(crossOrg).toHaveLength(0);

    // roleAId en tenantA → [userAId]
    const ownOrg = await repo.listAffectedUserIds(roleAId, tenantA);
    expect(ownOrg).toContain(userAId);
    expect(ownOrg).not.toContain(userBId);
  });

  // --------------- listMembersWithUsers ---------------

  it('listMembersWithUsers filtra por organizationId — no devuelve miembros de otra org', async () => {
    // roleBId en tenantB; preguntando por tenantA → []
    const crossOrg = await repo.listMembersWithUsers(roleBId, tenantA);
    expect(crossOrg).toHaveLength(0);

    // roleAId en tenantA → [{ user.id: userAId }]
    const ownOrg = await repo.listMembersWithUsers(roleAId, tenantA);
    expect(ownOrg).toHaveLength(1);
    expect(ownOrg[0]?.user.id).toBe(userAId);
  });
});
