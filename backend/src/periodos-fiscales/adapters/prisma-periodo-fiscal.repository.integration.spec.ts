import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaPeriodoFiscalRepository } from './prisma-periodo-fiscal.repository';

/**
 * Integration spec del `PrismaPeriodoFiscalRepository` contra Postgres real.
 *
 * Valida defense-in-depth multi-tenant (CLAUDE.md §4.2):
 *   — cerrar con organizationId: no cierra el período de otra org (P2025).
 *   — reabrir con organizationId: no reabre el período de otra org (P2025).
 *   — marcarDefinitivo con organizationId: no afecta período de otra org (P2025).
 */
describe('PrismaPeriodoFiscalRepository (integration) — aislamiento multi-tenant', () => {
  const SLUG_A = 'org-test-periodos-a';
  const SLUG_B = 'org-test-periodos-b';

  let prisma: PrismaClient;
  let repo: PrismaPeriodoFiscalRepository;
  let tenantA: string;
  let tenantB: string;
  let periodoAId: string;
  let _periodoBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaPeriodoFiscalRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({
        data: { slug: SLUG_A, name: 'Org A Periodos', tipoEmpresaPrincipal: 'COMERCIAL' },
      }),
      prisma.organization.create({
        data: { slug: SLUG_B, name: 'Org B Periodos', tipoEmpresaPrincipal: 'COMERCIAL' },
      }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    // Gestiones para cada org
    const [gestionA, gestionB] = await Promise.all([
      prisma.gestionFiscal.create({
        data: { organizationId: tenantA, year: 2025, mesInicio: 1 },
      }),
      prisma.gestionFiscal.create({
        data: { organizationId: tenantB, year: 2025, mesInicio: 1 },
      }),
    ]);

    // Un período en cada gestión
    const [periodoA, periodoB] = await Promise.all([
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: gestionA.id,
          year: 2025,
          month: 1,
          ordenEnGestion: 1,
          status: 'ABIERTO',
        },
      }),
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantB,
          gestionId: gestionB.id,
          year: 2025,
          month: 1,
          ordenEnGestion: 1,
          status: 'ABIERTO',
        },
      }),
    ]);
    periodoAId = periodoA.id;
    _periodoBId = periodoB.id;
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

  // --------------- cerrar ---------------

  it('cerrar cierra el período cuando el organizationId corresponde', async () => {
    const result = await prisma.$transaction((tx) =>
      repo.cerrar(tx, periodoAId, tenantA, 'user-a'),
    );
    expect(result.status).toBe('CERRADO');
  });

  it('cerrar lanza P2025 cuando se pasa el organizationId de otra org', async () => {
    // periodoA es de tenantA; pasando tenantB → Prisma no matchea → P2025
    await expect(
      prisma.$transaction((tx) => repo.cerrar(tx, periodoAId, tenantB, 'user-b')),
    ).rejects.toMatchObject({ code: 'P2025' });

    // El período de tenantA debe seguir ABIERTO (no fue afectado)
    const periodo = await prisma.periodoFiscal.findUnique({ where: { id: periodoAId } });
    expect(periodo?.status).toBe('ABIERTO');
  });

  // --------------- reabrir ---------------

  it('reabrir reabre el período cuando el organizationId corresponde', async () => {
    // Primero cerrarlo
    await prisma.periodoFiscal.update({ where: { id: periodoAId }, data: { status: 'CERRADO' } });

    const result = await prisma.$transaction((tx) => repo.reabrir(tx, periodoAId, tenantA));
    expect(result.status).toBe('ABIERTO');
  });

  it('reabrir lanza P2025 cuando se pasa el organizationId de otra org', async () => {
    // Cerrar periodoA
    await prisma.periodoFiscal.update({ where: { id: periodoAId }, data: { status: 'CERRADO' } });

    await expect(
      prisma.$transaction((tx) => repo.reabrir(tx, periodoAId, tenantB)),
    ).rejects.toMatchObject({ code: 'P2025' });

    // El período sigue CERRADO (no fue reabierto por error cross-tenant)
    const periodo = await prisma.periodoFiscal.findUnique({ where: { id: periodoAId } });
    expect(periodo?.status).toBe('CERRADO');
  });

  // --------------- marcarDefinitivo ---------------

  it('marcarDefinitivo marca cuando el organizationId corresponde', async () => {
    // Cerrarlo primero (la lógica del servicio lo requiere, pero el repo no valida estado)
    await prisma.periodoFiscal.update({ where: { id: periodoAId }, data: { status: 'CERRADO' } });

    const result = await prisma.$transaction((tx) =>
      repo.marcarDefinitivo(tx, periodoAId, tenantA),
    );
    expect(result.esDefinitivo).toBe(true);
  });

  it('marcarDefinitivo lanza P2025 cuando se pasa el organizationId de otra org', async () => {
    await prisma.periodoFiscal.update({ where: { id: periodoAId }, data: { status: 'CERRADO' } });

    await expect(
      prisma.$transaction((tx) => repo.marcarDefinitivo(tx, periodoAId, tenantB)),
    ).rejects.toMatchObject({ code: 'P2025' });

    // El período de tenantA no fue marcado definitivo
    const periodo = await prisma.periodoFiscal.findUnique({ where: { id: periodoAId } });
    expect(periodo?.esDefinitivo).toBe(false);
  });
});
