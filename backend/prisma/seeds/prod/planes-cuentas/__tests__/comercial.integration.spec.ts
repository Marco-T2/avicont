import { PrismaClient } from '@prisma/client';

import {
  MAPEO_CODIGO_A_CONCEPTO,
  poblarConfiguracionContableRequerida,
  sembrarPlanCuentasComercial,
} from '../comercial';

/**
 * Guarda de regresión del seed comercial autocontenido.
 *
 * Fija como contrato verificable que `sembrarPlanCuentasComercial` produce
 * EXACTAMENTE el mismo plan de cuentas que el seed previo basado en
 * `CatalogoPuct` —61 hojas + jerarquía, mismos códigos/niveles, 8 cuentas
 * `esRequeridaSistema`, 8/8 conceptos de `OrgConfiguracionContable`— SIN
 * consultar la tabla `CatalogoPuct` (los nombres/niveles/clases salen
 * inlineados del propio seed). Toda inserción filtra por `organizationId`
 * (CLAUDE.md §4.2).
 */
describe('sembrarPlanCuentasComercial (integration) — seed autocontenido', () => {
  const SLUG = 'org-test-seed-comercial';

  let prisma: PrismaClient;
  let organizationId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Seed Comercial' },
    });
    organizationId = org.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: SLUG },
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

  it('crea 61 cuentas hoja (esDetalle=true) más su jerarquía sin leer CatalogoPuct', async () => {
    const spy = jest.spyOn(prisma.catalogoPuct, 'findMany');

    const stats = await sembrarPlanCuentasComercial(prisma, organizationId);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    const hojas = await prisma.cuenta.count({
      where: { organizationId, esDetalle: true },
    });
    expect(hojas).toBe(61);

    expect(stats.totalCuentas).toBe(111);
    expect(stats.porNivel).toEqual({ 1: 5, 2: 14, 3: 31, 4: 61 });
  });

  it('mantiene la distribución por nivel idéntica al seed previo basado en PUCT', async () => {
    await sembrarPlanCuentasComercial(prisma, organizationId);

    const cuentas = await prisma.cuenta.findMany({
      where: { organizationId },
      select: { nivel: true },
    });
    const porNivel = cuentas.reduce<Record<number, number>>((acc, c) => {
      acc[c.nivel] = (acc[c.nivel] ?? 0) + 1;
      return acc;
    }, {});
    expect(porNivel).toEqual({ 1: 5, 2: 14, 3: 31, 4: 61 });
  });

  it('preserva las 8 cuentas esRequeridaSistema con los mismos codigoInterno', async () => {
    await sembrarPlanCuentasComercial(prisma, organizationId);

    const requeridas = await prisma.cuenta.findMany({
      where: { organizationId, esRequeridaSistema: true },
      select: { codigoInterno: true },
      orderBy: { codigoInterno: 'asc' },
    });
    expect(requeridas.map((c) => c.codigoInterno)).toEqual([
      '1.1.6.001',
      '2.1.4.001',
      '2.1.4.002',
      '2.1.4.004',
      '3.1.3.001',
      '3.1.4.001',
      '4.4.1.003',
      '5.6.1.003',
    ]);
  });

  it('conserva codigoInterno con la numeración estilo PUCT y su nombre inlineado', async () => {
    await sembrarPlanCuentasComercial(prisma, organizationId);

    const caja = await prisma.cuenta.findUnique({
      where: {
        organizationId_codigoInterno: { organizationId, codigoInterno: '1.1.1.001' },
      },
      select: { nombre: true, claseCuenta: true, nivel: true },
    });
    expect(caja).toEqual({ nombre: 'CAJA', claseCuenta: 'ACTIVO', nivel: 4 });

    const activo = await prisma.cuenta.findUnique({
      where: {
        organizationId_codigoInterno: { organizationId, codigoInterno: '1' },
      },
      select: { nombre: true, claseCuenta: true, nivel: true, esDetalle: true },
    });
    expect(activo).toEqual({
      nombre: 'ACTIVO',
      claseCuenta: 'ACTIVO',
      nivel: 1,
      esDetalle: false,
    });
  });

  it('pobla OrgConfiguracionContable con los 8 conceptos mapeados (8/8)', async () => {
    const stats = await sembrarPlanCuentasComercial(prisma, organizationId);
    const config = await poblarConfiguracionContableRequerida(
      prisma,
      organizationId,
      stats.porCodigoInterno,
    );

    const conceptos = [
      config.ivaCreditoId,
      config.ivaDebitoId,
      config.rcIvaRetenidoId,
      config.itPorPagarId,
      config.resultadosAcumuladosId,
      config.resultadoEjercicioId,
      config.difCambioGananciaId,
      config.difCambioPerdidaId,
    ];
    expect(conceptos.filter((v) => v !== null)).toHaveLength(8);
    expect(Object.keys(MAPEO_CODIGO_A_CONCEPTO)).toHaveLength(8);
    expect(config.organizationId).toBe(organizationId);
  });

  it('todas las cuentas creadas pertenecen a la organización sembrada (multi-tenant)', async () => {
    // Crea una segunda org como testigo: el seed NO debe escribir cuentas en ella.
    const otra = await prisma.organization.create({
      data: { slug: `${SLUG}-testigo`, name: 'Org Testigo' },
    });

    try {
      const stats = await sembrarPlanCuentasComercial(prisma, organizationId);

      const propias = await prisma.cuenta.count({ where: { organizationId } });
      expect(propias).toBe(stats.totalCuentas);

      const enTestigo = await prisma.cuenta.count({
        where: { organizationId: otra.id },
      });
      expect(enTestigo).toBe(0);
    } finally {
      await prisma.cuenta.deleteMany({ where: { organizationId: otra.id } });
      await prisma.organization.delete({ where: { id: otra.id } });
    }
  });
});
