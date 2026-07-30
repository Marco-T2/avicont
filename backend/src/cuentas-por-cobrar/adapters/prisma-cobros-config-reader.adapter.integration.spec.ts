import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCobrosConfigReaderAdapter } from './prisma-cobros-config-reader.adapter';

/**
 * Integration del adapter de config de cobros contra Postgres real.
 * §11.3: misma base de desarrollo — todo scopeado a los tenants del test.
 */
describe('PrismaCobrosConfigReaderAdapter (integration)', () => {
  const SLUG_A = 'org-test-cobros-config-a';
  const SLUG_B = 'org-test-cobros-config-b';

  let prisma: PrismaClient;
  let adapter: PrismaCobrosConfigReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let cuentaCxcB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaCobrosConfigReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A cobros config' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B cobros config' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    cuentaCxcB = (
      await prisma.cuenta.create({
        data: {
          organizationId: tenantB,
          codigoInterno: '1.1.2.001',
          nombre: 'CUENTAS POR COBRAR',
          claseCuenta: 'ACTIVO',
          naturaleza: 'DEUDORA',
          nivel: 3,
          esDetalle: true,
        },
      })
    ).id;
    await prisma.orgConfiguracionContable.create({
      data: { organizationId: tenantB, cuentasPorCobrarId: cuentaCxcB },
    });
  });

  async function cleanup() {
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  it('devuelve el concepto CxC mapeado del tenant', async () => {
    const config = await adapter.obtenerConfig(tenantB);

    expect(config).toEqual({ cuentasPorCobrarId: cuentaCxcB });
  });

  it('org sin fila de configuración → null, sin lanzar', async () => {
    const config = await adapter.obtenerConfig(tenantA);

    expect(config).toEqual({ cuentasPorCobrarId: null });
  });

  it('org con fila pero sin el concepto mapeado → null', async () => {
    await prisma.orgConfiguracionContable.create({ data: { organizationId: tenantA } });

    const config = await adapter.obtenerConfig(tenantA);

    expect(config).toEqual({ cuentasPorCobrarId: null });
  });

  it('NO cruza tenants (§4.2): la config de B no se lee desde A aunque exista', async () => {
    // Mutante que este test mata: quitar el filtro por organizationId dejaría
    // que findFirst devuelva la fila de B (u otra cualquiera de la base).
    const config = await adapter.obtenerConfig(tenantA);

    expect(config.cuentasPorCobrarId).not.toBe(cuentaCxcB);
  });
});
