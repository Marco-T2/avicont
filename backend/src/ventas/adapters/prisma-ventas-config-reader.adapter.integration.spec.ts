import { ClaseCuenta, NaturalezaCuenta, PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaVentasConfigReaderAdapter } from './prisma-ventas-config-reader.adapter';

/**
 * Integration del adapter de config comercial contra Postgres real.
 * §11.3: misma base de desarrollo — todo scopeado a los tenants del test.
 */
describe('PrismaVentasConfigReaderAdapter (integration)', () => {
  const SLUG_A = 'org-test-ventas-config-a';
  const SLUG_B = 'org-test-ventas-config-b';

  let prisma: PrismaClient;
  let adapter: PrismaVentasConfigReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let cuentaCxcB: string;
  let cuentaVentasB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaVentasConfigReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A ventas config' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B ventas config' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    cuentaCxcB = (await crearCuenta(tenantB, '1.1.2.001', 'CUENTAS POR COBRAR')).id;
    cuentaVentasB = (await crearCuenta(tenantB, '4.1.1.001', 'VENTAS')).id;
    await prisma.orgConfiguracionContable.create({
      data: {
        organizationId: tenantB,
        cuentasPorCobrarId: cuentaCxcB,
        ventasId: cuentaVentasB,
      },
    });
  });

  async function cleanup() {
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  function crearCuenta(organizationId: string, codigoInterno: string, nombre: string) {
    return prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre,
        claseCuenta: codigoInterno.startsWith('4') ? ClaseCuenta.INGRESO : ClaseCuenta.ACTIVO,
        naturaleza: codigoInterno.startsWith('4')
          ? NaturalezaCuenta.ACREEDORA
          : NaturalezaCuenta.DEUDORA,
        nivel: 3,
        esDetalle: true,
      },
    });
  }

  it('devuelve los dos conceptos mapeados del tenant', async () => {
    const config = await adapter.obtenerConfig(tenantB);

    expect(config).toEqual({ cuentasPorCobrarId: cuentaCxcB, ventasId: cuentaVentasB });
  });

  it('org sin fila de configuración → ambos null, sin lanzar', async () => {
    const config = await adapter.obtenerConfig(tenantA);

    expect(config).toEqual({ cuentasPorCobrarId: null, ventasId: null });
  });

  it('NO cruza tenants (§4.2): la config de B no se lee desde A aunque exista', async () => {
    // Mutante que este test mata: quitar el filtro por organizationId dejaría
    // que findFirst devuelva la fila de B (u otra cualquiera de la base).
    const config = await adapter.obtenerConfig(tenantA);

    expect(config.cuentasPorCobrarId).not.toBe(cuentaCxcB);
    expect(config.ventasId).not.toBe(cuentaVentasB);
  });
});
