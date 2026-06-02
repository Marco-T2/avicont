import { PrismaClient, TipoPack, VerticalPack } from '@prisma/client';

import { seedPacksCatalogo } from './packs-catalogo';

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
});
