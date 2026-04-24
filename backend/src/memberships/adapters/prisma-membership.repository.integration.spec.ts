import { PrismaClient, SystemRole } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaMembershipRepository } from './prisma-membership.repository';

/**
 * Integration spec de `PrismaMembershipRepository` contra Postgres real.
 * Valida las reglas que sólo Postgres puede contestar:
 *   - Multi-tenant scoping (findById / updateRol / deleteById filtran por tenant).
 *   - Clave compuesta `@@unique([organizationId, userId])` en findByUserAndTenant y delete.
 *   - FK Cascade desde Organization: cleanup vía delete org.
 *   - Filtros correctos de countOwners (sólo systemRole=OWNER, scopeado por tenant).
 *   - Shape del include user+customRole en `create`.
 */
describe('PrismaMembershipRepository (integration)', () => {
  const SLUG_A = 'org-test-memberships-a';
  const SLUG_B = 'org-test-memberships-b';
  const EMAIL_1 = 'user1-memberships@test.com';
  const EMAIL_2 = 'user2-memberships@test.com';
  const EMAIL_3 = 'user3-memberships@test.com';

  let prisma: PrismaClient;
  let repo: PrismaMembershipRepository;
  let tenantA: string;
  let tenantB: string;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  let customRoleAId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaMembershipRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const [u1, u2, u3] = await Promise.all([
      prisma.user.create({
        data: { email: EMAIL_1, hashedPassword: 'x', displayName: 'User 1' },
      }),
      prisma.user.create({
        data: { email: EMAIL_2, hashedPassword: 'x', displayName: 'User 2' },
      }),
      prisma.user.create({
        data: { email: EMAIL_3, hashedPassword: 'x' },
      }),
    ]);
    user1Id = u1.id;
    user2Id = u2.id;
    user3Id = u3.id;

    const customRoleA = await prisma.customRole.create({
      data: {
        organizationId: tenantA,
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.read'],
      },
    });
    customRoleAId = customRoleA.id;
  });

  async function cleanup() {
    // Orgs cascadean memberships y customRoles (onDelete:Cascade).
    // Users se borran aparte (no hay FK User→Organization).
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    if (orgs.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: orgs.map((o) => o.id) } },
      });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [EMAIL_1, EMAIL_2, EMAIL_3] } },
    });
  }

  // ==========================================================
  // create
  // ==========================================================

  describe('create', () => {
    it('persiste membership con systemRole y retorna user + customRole', async () => {
      const m = await repo.create(tenantA, {
        userId: user1Id,
        systemRole: SystemRole.OWNER,
        customRoleId: null,
      });
      expect(m.organizationId).toBe(tenantA);
      expect(m.userId).toBe(user1Id);
      expect(m.systemRole).toBe(SystemRole.OWNER);
      expect(m.customRoleId).toBeNull();
      expect(m.user).toEqual({
        id: user1Id,
        email: EMAIL_1,
        displayName: 'User 1',
      });
      expect(m.customRole).toBeNull();
    });

    it('persiste membership con customRoleId y retorna customRole poblado', async () => {
      const m = await repo.create(tenantA, {
        userId: user2Id,
        systemRole: null,
        customRoleId: customRoleAId,
      });
      expect(m.systemRole).toBeNull();
      expect(m.customRoleId).toBe(customRoleAId);
      expect(m.customRole).toEqual({
        id: customRoleAId,
        slug: 'contador',
        name: 'Contador',
      });
    });

    it('incluye displayName null cuando el user no tiene displayName', async () => {
      const m = await repo.create(tenantA, {
        userId: user3Id,
        systemRole: SystemRole.ADMIN,
        customRoleId: null,
      });
      expect(m.user.displayName).toBeNull();
    });
  });

  // ==========================================================
  // findById — multi-tenant scoping
  // ==========================================================

  describe('findById', () => {
    it('retorna la membership si pertenece al tenant', async () => {
      const created = await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.OWNER,
        },
      });
      const found = await repo.findById(tenantA, created.id);
      expect(found?.id).toBe(created.id);
    });

    it('retorna null si el ID existe pero en otro tenant', async () => {
      const created = await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.OWNER,
        },
      });
      const found = await repo.findById(tenantB, created.id);
      expect(found).toBeNull();
    });

    it('retorna null si el ID no existe', async () => {
      const found = await repo.findById(
        tenantA,
        '00000000-0000-4000-8000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  // ==========================================================
  // findByUserAndTenant
  // ==========================================================

  describe('findByUserAndTenant', () => {
    it('retorna la membership del user en el tenant', async () => {
      await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.ADMIN,
        },
      });
      const found = await repo.findByUserAndTenant(tenantA, user1Id);
      expect(found?.userId).toBe(user1Id);
      expect(found?.systemRole).toBe(SystemRole.ADMIN);
    });

    it('retorna null si el user está en otro tenant', async () => {
      await prisma.membership.create({
        data: {
          organizationId: tenantB,
          userId: user1Id,
          systemRole: SystemRole.ADMIN,
        },
      });
      const found = await repo.findByUserAndTenant(tenantA, user1Id);
      expect(found).toBeNull();
    });

    it('retorna null si el user no tiene membership en el tenant', async () => {
      const found = await repo.findByUserAndTenant(tenantA, user1Id);
      expect(found).toBeNull();
    });
  });

  // ==========================================================
  // updateRol
  // ==========================================================

  describe('updateRol', () => {
    it('cambia de systemRole a customRoleId', async () => {
      const m = await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.ADMIN,
        },
      });
      const updated = await repo.updateRol(tenantA, m.id, {
        systemRole: null,
        customRoleId: customRoleAId,
      });
      expect(updated.systemRole).toBeNull();
      expect(updated.customRoleId).toBe(customRoleAId);
    });

    it('cambia de customRoleId a systemRole', async () => {
      const m = await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          customRoleId: customRoleAId,
        },
      });
      const updated = await repo.updateRol(tenantA, m.id, {
        systemRole: SystemRole.OWNER,
        customRoleId: null,
      });
      expect(updated.systemRole).toBe(SystemRole.OWNER);
      expect(updated.customRoleId).toBeNull();
    });

    it('rechaza el update si el membership pertenece a otro tenant', async () => {
      const m = await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.OWNER,
        },
      });
      await expect(
        repo.updateRol(tenantB, m.id, {
          systemRole: SystemRole.ADMIN,
          customRoleId: null,
        }),
      ).rejects.toThrow();
    });
  });

  // ==========================================================
  // deleteById
  // ==========================================================

  describe('deleteById', () => {
    it('elimina la membership y retorna la entidad borrada', async () => {
      const m = await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.OWNER,
        },
      });
      const deleted = await repo.deleteById(tenantA, m.id);
      expect(deleted.id).toBe(m.id);
      const gone = await prisma.membership.findUnique({ where: { id: m.id } });
      expect(gone).toBeNull();
    });

    it('rechaza el delete si el membership pertenece a otro tenant', async () => {
      const m = await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.OWNER,
        },
      });
      await expect(repo.deleteById(tenantB, m.id)).rejects.toThrow();
    });
  });

  // ==========================================================
  // deleteByUserAndTenant
  // ==========================================================

  describe('deleteByUserAndTenant', () => {
    it('elimina por clave compuesta y retorna la entidad', async () => {
      await prisma.membership.create({
        data: {
          organizationId: tenantA,
          userId: user1Id,
          systemRole: SystemRole.OWNER,
        },
      });
      const deleted = await repo.deleteByUserAndTenant(tenantA, user1Id);
      expect(deleted.userId).toBe(user1Id);
      const gone = await prisma.membership.findUnique({
        where: {
          organizationId_userId: { organizationId: tenantA, userId: user1Id },
        },
      });
      expect(gone).toBeNull();
    });
  });

  // ==========================================================
  // countOwners
  // ==========================================================

  describe('countOwners', () => {
    it('cuenta sólo systemRole=OWNER del tenant', async () => {
      await prisma.membership.createMany({
        data: [
          {
            organizationId: tenantA,
            userId: user1Id,
            systemRole: SystemRole.OWNER,
          },
          {
            organizationId: tenantA,
            userId: user2Id,
            systemRole: SystemRole.OWNER,
          },
          {
            organizationId: tenantA,
            userId: user3Id,
            systemRole: SystemRole.ADMIN,
          },
        ],
      });
      expect(await repo.countOwners(tenantA)).toBe(2);
    });

    it('no cuenta memberships de otros tenants', async () => {
      await prisma.membership.createMany({
        data: [
          {
            organizationId: tenantA,
            userId: user1Id,
            systemRole: SystemRole.OWNER,
          },
          {
            organizationId: tenantB,
            userId: user2Id,
            systemRole: SystemRole.OWNER,
          },
        ],
      });
      expect(await repo.countOwners(tenantA)).toBe(1);
      expect(await repo.countOwners(tenantB)).toBe(1);
    });

    it('no cuenta memberships con customRoleId (no son systemRole=OWNER)', async () => {
      await prisma.membership.createMany({
        data: [
          {
            organizationId: tenantA,
            userId: user1Id,
            systemRole: SystemRole.OWNER,
          },
          {
            organizationId: tenantA,
            userId: user2Id,
            customRoleId: customRoleAId,
          },
        ],
      });
      expect(await repo.countOwners(tenantA)).toBe(1);
    });

    it('retorna 0 cuando no hay owners', async () => {
      expect(await repo.countOwners(tenantA)).toBe(0);
    });
  });
});
