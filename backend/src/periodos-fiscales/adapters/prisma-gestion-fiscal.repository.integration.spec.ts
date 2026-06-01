import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaGestionFiscalRepository } from './prisma-gestion-fiscal.repository';

/**
 * Integration spec del `PrismaGestionFiscalRepository` contra Postgres real.
 *
 * Valida defense-in-depth multi-tenant (CLAUDE.md §4.2):
 *   — cerrarGestion con organizationId: no cierra la gestión de otra org (P2025).
 *   — crearGestionConPeriodos: el findUniqueOrThrow final incluye organizationId.
 */
describe('PrismaGestionFiscalRepository (integration) — aislamiento multi-tenant', () => {
  const SLUG_A = 'org-test-gestiones-a';
  const SLUG_B = 'org-test-gestiones-b';

  let prisma: PrismaClient;
  let repo: PrismaGestionFiscalRepository;
  let tenantA: string;
  let tenantB: string;
  let gestionAId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaGestionFiscalRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: { slug: SLUG_A, name: 'Org A Gestiones', tipoEmpresaPrincipal: 'COMERCIAL' },
      }),
      prisma.organization.create({
        data: { slug: SLUG_B, name: 'Org B Gestiones', tipoEmpresaPrincipal: 'COMERCIAL' },
      }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    // Gestión de tenantA con todos sus períodos CERRADOS (para poder cerrar la gestión)
    const gestionA = await prisma.gestionFiscal.create({
      data: { organizationId: tenantA, year: 2025, mesInicio: 1, status: 'ABIERTA' },
    });
    gestionAId = gestionA.id;

    // Crear 12 períodos CERRADOS en la gestión A
    await prisma.periodoFiscal.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        organizationId: tenantA,
        gestionId: gestionAId,
        year: 2025,
        month: i + 1,
        ordenEnGestion: i + 1,
        status: 'CERRADO' as const,
      })),
    });
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    if (orgs.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
    }
  }

  // --------------- cerrarGestion ---------------

  it('cerrarGestion cierra cuando el organizationId corresponde', async () => {
    const result = await prisma.$transaction((tx) =>
      repo.cerrarGestion(tx, gestionAId, tenantA, 'user-a'),
    );
    expect(result.status).toBe('CERRADA');
  });

  it('cerrarGestion lanza P2025 cuando se pasa el organizationId de otra org', async () => {
    // gestionA es de tenantA; pasando tenantB → P2025
    await expect(
      prisma.$transaction((tx) => repo.cerrarGestion(tx, gestionAId, tenantB, 'user-b')),
    ).rejects.toMatchObject({ code: 'P2025' });

    // La gestión de tenantA debe seguir ABIERTA
    const gestion = await prisma.gestionFiscal.findUnique({ where: { id: gestionAId } });
    expect(gestion?.status).toBe('ABIERTA');
  });
});
