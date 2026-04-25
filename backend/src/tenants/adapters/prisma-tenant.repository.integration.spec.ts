import { PrismaClient, SystemRole } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaTenantRepository } from './prisma-tenant.repository';

/**
 * Integration spec de `PrismaTenantRepository` contra Postgres real.
 * Valida lo que sólo Postgres puede contestar:
 *   - Nested write atómico: create org + membership OWNER en una operación.
 *   - UNIQUE constraint en `Organization.slug`.
 *   - Patch parcial en update / updateFeatures: campos no provistos no se tocan.
 *   - Proyección de findFeatures (pull mínimo).
 */
describe('PrismaTenantRepository (integration)', () => {
  const SLUG_A = 'org-test-tenants-repo-a';
  const SLUG_B = 'org-test-tenants-repo-b';
  const EMAIL_OWNER = 'owner-tenants-repo@test.com';

  let prisma: PrismaClient;
  let repo: PrismaTenantRepository;
  let ownerId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaTenantRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const owner = await prisma.user.create({
      data: { email: EMAIL_OWNER, hashedPassword: 'x', displayName: 'Owner' },
    });
    ownerId = owner.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    if (orgs.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: orgs.map((o) => o.id) } },
      });
    }
    await prisma.user.deleteMany({ where: { email: EMAIL_OWNER } });
  }

  describe('create', () => {
    it('crea organización + membership OWNER en una sola operación atómica', async () => {
      const org = await repo.create({
        slug: SLUG_A,
        name: 'Tenant A',
        ownerUserId: ownerId,
      });

      expect(org.slug).toBe(SLUG_A);
      expect(org.name).toBe('Tenant A');
      expect(org.memberships).toHaveLength(1);
      expect(org.memberships[0]?.userId).toBe(ownerId);
      expect(org.memberships[0]?.systemRole).toBe(SystemRole.OWNER);
    });

    it('falla con UNIQUE violation si el slug ya existe', async () => {
      await repo.create({ slug: SLUG_A, name: 'A1', ownerUserId: ownerId });
      await expect(
        repo.create({ slug: SLUG_A, name: 'A2', ownerUserId: ownerId }),
      ).rejects.toThrow(/Unique/i);
    });
  });

  describe('findById / findBySlug', () => {
    it('findById retorna la organización si existe', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'Tenant A',
        ownerUserId: ownerId,
      });
      const found = await repo.findById(created.id);
      expect(found?.slug).toBe(SLUG_A);
    });

    it('findById retorna null si no existe', async () => {
      const found = await repo.findById('11111111-2222-4333-8444-555555555555');
      expect(found).toBeNull();
    });

    it('findBySlug retorna la organización si existe', async () => {
      await repo.create({ slug: SLUG_A, name: 'Tenant A', ownerUserId: ownerId });
      const found = await repo.findBySlug(SLUG_A);
      expect(found?.name).toBe('Tenant A');
    });

    it('findBySlug retorna null si no existe', async () => {
      const found = await repo.findBySlug('inexistente');
      expect(found).toBeNull();
    });
  });

  describe('existsBySlug', () => {
    it('true si existe', async () => {
      await repo.create({ slug: SLUG_A, name: 'A', ownerUserId: ownerId });
      expect(await repo.existsBySlug(SLUG_A)).toBe(true);
    });

    it('false si no existe', async () => {
      expect(await repo.existsBySlug('inexistente')).toBe(false);
    });
  });

  describe('update', () => {
    it('aplica sólo los campos definidos (patch parcial)', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'Original',
        ownerUserId: ownerId,
      });

      const updated = await repo.update(created.id, { name: 'Renombrado' });
      expect(updated.name).toBe('Renombrado');
      expect(updated.slug).toBe(SLUG_A); // no se tocó
      expect(updated.tipoEmpresaPrincipal).toBe(created.tipoEmpresaPrincipal);
    });

    it('cambia tipoEmpresaPrincipal si viene en el patch', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'A',
        ownerUserId: ownerId,
      });
      const updated = await repo.update(created.id, {
        tipoEmpresaPrincipal: 'SERVICIOS',
      });
      expect(updated.tipoEmpresaPrincipal).toBe('SERVICIOS');
    });
  });

  describe('findFeatures', () => {
    it('retorna sólo los flags de features', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'A',
        ownerUserId: ownerId,
      });
      const features = await repo.findFeatures(created.id);
      expect(features).toEqual({
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
    });

    it('retorna null si no existe', async () => {
      const features = await repo.findFeatures(
        '11111111-2222-4333-8444-555555555555',
      );
      expect(features).toBeNull();
    });
  });

  describe('updateFeatures', () => {
    it('aplica patch parcial — sólo los flags definidos cambian', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'A',
        ownerUserId: ownerId,
      });

      const updated = await repo.updateFeatures(created.id, {
        granjaEnabled: true,
      });
      expect(updated.granjaEnabled).toBe(true);
      expect(updated.contabilidadEnabled).toBe(true); // no se tocó

      const updated2 = await repo.updateFeatures(created.id, {
        contabilidadEnabled: false,
      });
      expect(updated2.contabilidadEnabled).toBe(false);
      expect(updated2.granjaEnabled).toBe(true);
    });
  });
});
