import { PrismaClient, SystemRole } from '@prisma/client';

import { TipoEmpresa } from '@/common/domain/enums';
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
        contabilidadEnabled: true,
        granjaEnabled: false,
      });

      expect(org.slug).toBe(SLUG_A);
      expect(org.name).toBe('Tenant A');
      expect(org.memberships).toHaveLength(1);
      expect(org.memberships[0]?.userId).toBe(ownerId);
      expect(org.memberships[0]?.systemRole).toBe(SystemRole.OWNER);
    });

    it('falla con UNIQUE violation si el slug ya existe', async () => {
      await repo.create({
        slug: SLUG_A,
        name: 'A1',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      await expect(
        repo.create({
          slug: SLUG_A,
          name: 'A2',
          ownerUserId: ownerId,
          contabilidadEnabled: true,
          granjaEnabled: false,
        }),
      ).rejects.toThrow(/Unique/i);
    });
  });

  describe('findById / findBySlug', () => {
    it('findById retorna la organización si existe', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'Tenant A',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      const found = await repo.findById(created.id);
      expect(found?.slug).toBe(SLUG_A);
    });

    it('findById retorna null si no existe', async () => {
      const found = await repo.findById('11111111-2222-4333-8444-555555555555');
      expect(found).toBeNull();
    });

    it('findBySlug retorna la organización si existe', async () => {
      await repo.create({
        slug: SLUG_A,
        name: 'Tenant A',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
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
      await repo.create({
        slug: SLUG_A,
        name: 'A',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
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
        contabilidadEnabled: true,
        granjaEnabled: false,
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
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      const updated = await repo.update(created.id, {
        tipoEmpresaPrincipal: TipoEmpresa.SERVICIOS,
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
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      const features = await repo.findFeatures(created.id);
      expect(features).toEqual({
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
    });

    it('retorna null si no existe', async () => {
      const features = await repo.findFeatures('11111111-2222-4333-8444-555555555555');
      expect(features).toBeNull();
    });
  });

  describe('update — campos fiscales', () => {
    it('persiste los 6 campos fiscales cuando están presentes', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'Tenant Fiscal',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });

      const updated = await repo.update(created.id, {
        razonSocial: 'Avicultura del Norte S.R.L.',
        nit: '1234567',
        direccion: 'Av. Ballivián 123',
        representanteLegal: 'Juan Pérez',
        telefono: '591-2-2123456',
        email: 'contacto@norte.com',
      });

      expect(updated.razonSocial).toBe('Avicultura del Norte S.R.L.');
      expect(updated.nit).toBe('1234567');
      expect(updated.direccion).toBe('Av. Ballivián 123');
      expect(updated.representanteLegal).toBe('Juan Pérez');
      expect(updated.telefono).toBe('591-2-2123456');
      expect(updated.email).toBe('contacto@norte.com');
    });

    it('NO sobrescribe campos fiscales cuando no están en el payload (spread condicional)', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'Tenant Fiscal',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      await repo.update(created.id, {
        razonSocial: 'Original S.R.L.',
        nit: '9999999',
      });

      // Actualizar solo el name, los fiscales no deben cambiar
      const updated = await repo.update(created.id, { name: 'Renombrado' });

      expect(updated.razonSocial).toBe('Original S.R.L.');
      expect(updated.nit).toBe('9999999');
    });

    it('setea un campo a null cuando el payload incluye null explícito', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'Tenant Fiscal',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      await repo.update(created.id, { nit: '1234567' });

      // Desmapear: pasar null explícito
      const updated = await repo.update(created.id, { nit: null });

      expect(updated.nit).toBeNull();
    });
  });

  describe('updateFeatures', () => {
    it('aplica patch parcial — sólo los flags definidos cambian', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'A',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });

      // Apagar contabilidad (org queda sin vertical): patch parcial, granja intacto.
      const updated = await repo.updateFeatures(created.id, {
        contabilidadEnabled: false,
      });
      expect(updated.contabilidadEnabled).toBe(false);
      expect(updated.granjaEnabled).toBe(false); // no se tocó

      // Switchear a granja: patch parcial, contabilidad intacto.
      const updated2 = await repo.updateFeatures(created.id, {
        granjaEnabled: true,
      });
      expect(updated2.granjaEnabled).toBe(true);
      expect(updated2.contabilidadEnabled).toBe(false);
    });

    // §10.4 (plataforma-multi-vertical): vertical exclusivo, invariante de BD.
    // El CHECK constraint rechaza ambos verticales a la vez aunque el escritor
    // (repo "tonto") no valide — defense in depth (CLAUDE.md §4.8).
    it('el CHECK constraint rechaza prender ambos verticales a la vez', async () => {
      const created = await repo.create({
        slug: SLUG_A,
        name: 'A',
        ownerUserId: ownerId,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });

      await expect(repo.updateFeatures(created.id, { granjaEnabled: true })).rejects.toThrow(
        /vertical_exclusivo|check constraint/i,
      );
    });
  });
});
