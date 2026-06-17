import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaPlanCuentasSeederAdapter } from './prisma-plan-cuentas-seeder.adapter';

/**
 * Integration spec del `PrismaPlanCuentasSeederAdapter` contra Postgres real.
 *
 * Valida las garantías que SOLO Postgres puede demostrar:
 *   - Siembra exactamente 110 cuentas + 1 OrgConfiguracionContable por tenant.
 *   - Idempotencia: re-ejecutar no duplica registros (upsert).
 *   - Aislamiento multi-tenant: las cuentas de la org A no tienen el
 *     organizationId de la org B.
 *   - Rollback: si la TX se revierte, no quedan datos persistidos.
 */
describe('PrismaPlanCuentasSeederAdapter (integration)', () => {
  const SLUG_A = 'org-test-pcsa-a';
  const SLUG_B = 'org-test-pcsa-b';

  let prisma: PrismaClient;
  let adapter: PrismaPlanCuentasSeederAdapter;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaPlanCuentasSeederAdapter();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org PCSA A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org PCSA B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length === 0) return;
    await prisma.orgConfiguracionContable.deleteMany({
      where: { organizationId: { in: orgIds } },
    });
    await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }

  it('siembra exactamente 110 cuentas + OrgConfiguracionContable dentro de una TX', async () => {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await adapter.seedDefaultsForTenant(tenantA, tx);
    });

    const cuentaCount = await prisma.cuenta.count({
      where: { organizationId: tenantA },
    });
    expect(cuentaCount).toBe(110);

    const config = await prisma.orgConfiguracionContable.findUnique({
      where: { organizationId: tenantA },
    });
    expect(config).not.toBeNull();
    expect(config!.organizationId).toBe(tenantA);

    // Los 8 conceptos requeridos deben estar mapeados
    const conceptos = [
      config!.ivaCreditoId,
      config!.ivaDebitoId,
      config!.rcIvaRetenidoId,
      config!.itPorPagarId,
      config!.resultadosAcumuladosId,
      config!.resultadoEjercicioId,
      config!.difCambioGananciaId,
      config!.difCambioPerdidaId,
    ];
    expect(conceptos.filter((v) => v !== null)).toHaveLength(8);
  });

  it('idempotencia: re-ejecutar sobre el mismo tenant no duplica cuentas', async () => {
    // Primera siembra
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await adapter.seedDefaultsForTenant(tenantA, tx);
    });

    // Segunda siembra — debe ser idempotente
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await adapter.seedDefaultsForTenant(tenantA, tx);
    });

    const cuentaCount = await prisma.cuenta.count({
      where: { organizationId: tenantA },
    });
    expect(cuentaCount).toBe(110);

    const configCount = await prisma.orgConfiguracionContable.count({
      where: { organizationId: tenantA },
    });
    expect(configCount).toBe(1);
  });

  it('aislamiento multi-tenant: las cuentas de A no tienen el organizationId de B', async () => {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await adapter.seedDefaultsForTenant(tenantA, tx);
    });
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await adapter.seedDefaultsForTenant(tenantB, tx);
    });

    const cuentasA = await prisma.cuenta.count({
      where: { organizationId: tenantA },
    });
    const cuentasB = await prisma.cuenta.count({
      where: { organizationId: tenantB },
    });
    expect(cuentasA).toBe(110);
    expect(cuentasB).toBe(110);

    // Ninguna cuenta de A tiene el organizationId de B y viceversa
    // Ninguna cuenta de A aparece bajo el organizationId de B
    const cuentasConOrgBId = await prisma.cuenta.count({
      where: { organizationId: tenantB },
    });
    // tenantB solo tiene sus propias 110 cuentas, no las de A
    expect(cuentasConOrgBId).toBe(110);

    // Ninguna cuenta de B aparece bajo el organizationId de A
    const cuentasConOrgAId = await prisma.cuenta.count({
      where: { organizationId: tenantA },
    });
    expect(cuentasConOrgAId).toBe(110);
  });

  it('rollback: si la TX se revierte, no quedan datos persistidos', async () => {
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await adapter.seedDefaultsForTenant(tenantA, tx);
        // Forzar rollback lanzando un error
        throw new Error('rollback intencional para el test');
      });
    } catch {
      // Error esperado — la TX hizo rollback
    }

    const cuentaCount = await prisma.cuenta.count({
      where: { organizationId: tenantA },
    });
    expect(cuentaCount).toBe(0);

    const configCount = await prisma.orgConfiguracionContable.count({
      where: { organizationId: tenantA },
    });
    expect(configCount).toBe(0);
  });
});
