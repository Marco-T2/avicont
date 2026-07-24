import { PrismaClient, SystemRole, TipoPack, VerticalPack } from '@prisma/client';

import { seedPacksCatalogo, backfillOtorgamientoPorDefecto } from './packs-catalogo';

/**
 * Integration spec del catálogo de packs (Slice 1, riel eje 2).
 *
 * Usa Prisma real contra Postgres (CLAUDE.md §7.2: integración preferida sobre
 * E2E para lógica testeable directamente). Verifica los invariantes del schema
 * del riel de packs:
 *  (a) el seed deja los packs esperados y es idempotente,
 *  (b) @@unique([organizationId, packId]) rechaza doble entitlement,
 *  (c) `activo` default false en OrgPackEntitlement (habilitar ≠ activar),
 *  (d) `Pack` es catálogo global (sin organizationId).
 *
 * Ver docs/disenos/packs-eje2.md §4 y openspec/changes/packs-riel.
 */
describe('Riel de packs — schema y seed del catálogo', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await seedPacksCatalogo(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('seed del catálogo', () => {
    it('[+] deja los packs placeholder esperados (adjuntos y rag de contabilidad)', async () => {
      const adjuntos = await prisma.pack.findUnique({
        where: { clave: 'contabilidad.adjuntos' },
      });
      const rag = await prisma.pack.findUnique({
        where: { clave: 'contabilidad.rag' },
      });

      expect(adjuntos).not.toBeNull();
      expect(adjuntos?.verticalAplicable).toBe(VerticalPack.CONTABILIDAD);
      expect(adjuntos?.tipo).toBe(TipoPack.CAPACIDAD);
      expect(adjuntos?.activo).toBe(true);

      expect(rag).not.toBeNull();
      expect(rag?.verticalAplicable).toBe(VerticalPack.CONTABILIDAD);
      expect(rag?.tipo).toBe(TipoPack.CAPACIDAD);
    });

    it('[+] contabilidad.conciliacion es DOMINIO, CONTABILIDAD, otorgadoPorDefecto=true', async () => {
      const conciliacion = await prisma.pack.findUnique({
        where: { clave: 'contabilidad.conciliacion' },
      });

      expect(conciliacion).not.toBeNull();
      expect(conciliacion?.verticalAplicable).toBe(VerticalPack.CONTABILIDAD);
      expect(conciliacion?.tipo).toBe(TipoPack.DOMINIO);
      expect(conciliacion?.otorgadoPorDefecto).toBe(true);
      expect(conciliacion?.activo).toBe(true);
    });

    it('[+] adjuntos y rag siguen con otorgadoPorDefecto=false (camino manual del super-admin)', async () => {
      const adjuntos = await prisma.pack.findUnique({
        where: { clave: 'contabilidad.adjuntos' },
      });
      expect(adjuntos?.otorgadoPorDefecto).toBe(false);
    });

    it('[+] es idempotente: re-correr el seed no duplica filas', async () => {
      const antes = await prisma.pack.count();
      await seedPacksCatalogo(prisma);
      const despues = await prisma.pack.count();
      expect(despues).toBe(antes);
    });
  });

  describe('Pack es catálogo global', () => {
    it('[−] el modelo Pack no tiene columna organizationId', async () => {
      const columnas = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'packs'
      `;
      const nombres = columnas.map((c) => c.column_name);
      expect(nombres).not.toContain('organizationId');
      expect(nombres).not.toContain('organization_id');
    });
  });

  describe('OrgPackEntitlement', () => {
    let organizationId: string;
    let packId: string;
    let habilitadoPorUserId: string;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `packs-entitlement-${Date.now()}@example.com`,
          hashedPassword: 'hashed-irrelevant',
          isActive: true,
        },
      });
      habilitadoPorUserId = user.id;

      const org = await prisma.organization.create({
        data: {
          slug: `packs-entitlement-${Date.now()}`,
          name: 'Org de prueba packs',
          contabilidadEnabled: true,
        },
      });
      organizationId = org.id;

      const pack = await prisma.pack.findUniqueOrThrow({
        where: { clave: 'contabilidad.adjuntos' },
      });
      packId = pack.id;
    });

    afterAll(async () => {
      await prisma.orgPackEntitlement.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
      await prisma.user.delete({ where: { id: habilitadoPorUserId } });
    });

    it('[+] habilitar crea la fila con activo=false (habilitar ≠ activar)', async () => {
      const entitlement = await prisma.orgPackEntitlement.create({
        data: { organizationId, packId, habilitadoPorUserId },
      });
      expect(entitlement.activo).toBe(false);
    });

    it('[−] @@unique([organizationId, packId]) rechaza doble entitlement', async () => {
      await expect(
        prisma.orgPackEntitlement.create({
          data: { organizationId, packId, habilitadoPorUserId },
        }),
      ).rejects.toThrow();
    });
  });

  describe('backfillOtorgamientoPorDefecto (design conciliacion-bancaria §7.4)', () => {
    let orgSlug: string;
    let orgId: string;
    let ownerId: string;

    beforeEach(async () => {
      orgSlug = `packs-backfill-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const org = await prisma.organization.create({
        data: { slug: orgSlug, name: 'Org backfill packs', contabilidadEnabled: true },
      });
      orgId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `packs-backfill-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
          hashedPassword: 'hashed-irrelevant',
          isActive: true,
        },
      });
      ownerId = user.id;
      await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, systemRole: SystemRole.OWNER },
      });
    });

    afterEach(async () => {
      await prisma.orgPackEntitlement.deleteMany({ where: { organizationId: orgId } });
      await prisma.membership.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
      await prisma.user.delete({ where: { id: ownerId } });
    });

    it('[+] otorga contabilidad.conciliacion activo=true a una org existente vía el OWNER', async () => {
      await backfillOtorgamientoPorDefecto(prisma);

      const pack = await prisma.pack.findUniqueOrThrow({
        where: { clave: 'contabilidad.conciliacion' },
      });
      const entitlement = await prisma.orgPackEntitlement.findUnique({
        where: { organizationId_packId: { organizationId: orgId, packId: pack.id } },
      });

      expect(entitlement).not.toBeNull();
      expect(entitlement?.activo).toBe(true);
      expect(entitlement?.habilitadoPorUserId).toBe(ownerId);
    });

    it('[+] es idempotente y NO pisa un activo=false ya elegido por la org', async () => {
      const pack = await prisma.pack.findUniqueOrThrow({
        where: { clave: 'contabilidad.conciliacion' },
      });
      await prisma.orgPackEntitlement.create({
        data: { organizationId: orgId, packId: pack.id, activo: false, habilitadoPorUserId: ownerId },
      });

      await backfillOtorgamientoPorDefecto(prisma);

      const entitlement = await prisma.orgPackEntitlement.findUnique({
        where: { organizationId_packId: { organizationId: orgId, packId: pack.id } },
      });
      expect(entitlement?.activo).toBe(false);
    });

    it('[−] una org GRANJA no recibe contabilidad.conciliacion', async () => {
      await prisma.organization.update({
        where: { id: orgId },
        data: { contabilidadEnabled: false, granjaEnabled: true },
      });

      await backfillOtorgamientoPorDefecto(prisma);

      const pack = await prisma.pack.findUniqueOrThrow({
        where: { clave: 'contabilidad.conciliacion' },
      });
      const entitlement = await prisma.orgPackEntitlement.findUnique({
        where: { organizationId_packId: { organizationId: orgId, packId: pack.id } },
      });
      expect(entitlement).toBeNull();
    });
  });
});
