import { ClaseCuenta, NaturalezaCuenta, PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCuentasReaderLookupAdapter } from './prisma-cuentas-reader-lookup.adapter';

/**
 * Integration spec del adapter `PrismaCuentasReaderLookupAdapter` contra Postgres real.
 *
 * Valida:
 *   - lookup de cuenta de detalle del tenant → { id, esDetalle: true }
 *   - lookup de cuenta agrupadora del tenant → { id, esDetalle: false }
 *   - UUID inexistente → null
 *   - CRÍTICO multi-tenant (§4.2): cuenta de OTRO tenant → null (Anti-31)
 */
describe('PrismaCuentasReaderLookupAdapter (integration)', () => {
  const SLUG_A = 'org-cuentas-lookup-a';
  const SLUG_B = 'org-cuentas-lookup-b';

  let prisma: PrismaClient;
  let adapter: PrismaCuentasReaderLookupAdapter;
  let tenantA: string;
  let tenantB: string;
  let cuentaDetalleAId: string;
  let cuentaAgrupdoraAId: string;
  let cuentaDetalleBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaCuentasReaderLookupAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Cuentas Lookup A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Cuentas Lookup B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const [cuentaDetalle, cuentaAgrupadora, cuentaDetalleB] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.1',
          nombre: 'Caja y Bancos',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 2,
          esDetalle: false,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantB,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN Tenant B',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);
    cuentaDetalleAId = cuentaDetalle.id;
    cuentaAgrupdoraAId = cuentaAgrupadora.id;
    cuentaDetalleBId = cuentaDetalleB.id;
  });

  async function cleanup() {
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
  }

  it('cuenta de detalle del tenant → { id, esDetalle: true }', async () => {
    const result = await adapter.obtenerCuentaDetalle(tenantA, cuentaDetalleAId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(cuentaDetalleAId);
    expect(result!.esDetalle).toBe(true);
  });

  it('cuenta agrupadora del tenant → { id, esDetalle: false }', async () => {
    const result = await adapter.obtenerCuentaDetalle(tenantA, cuentaAgrupdoraAId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(cuentaAgrupdoraAId);
    expect(result!.esDetalle).toBe(false);
  });

  it('UUID inexistente → null', async () => {
    const result = await adapter.obtenerCuentaDetalle(
      tenantA,
      'a1b2c3d4-e5f6-4a7b-8c9d-000000000000',
    );
    expect(result).toBeNull();
  });

  it('CRÍTICO multi-tenant (§4.2): cuenta de OTRO tenant → null (Anti-31, no enumera ids ajenos)', async () => {
    // cuentaDetalleBId pertenece a tenantB; consultamos desde tenantA → debe devolver null
    const result = await adapter.obtenerCuentaDetalle(tenantA, cuentaDetalleBId);
    expect(result).toBeNull();
  });
});
