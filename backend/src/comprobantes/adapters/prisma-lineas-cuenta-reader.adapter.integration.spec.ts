import {
  ClaseCuenta,
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaLineasCuentaReaderAdapter } from './prisma-lineas-cuenta-reader.adapter';

/**
 * Integration spec de `PrismaLineasCuentaReaderAdapter` contra Postgres real
 * (task 5.2 del change `conciliacion-bancaria`, design §3).
 *
 * Cubre:
 *   - Solo `CONTABILIZADO`/`BLOQUEADO` con `anulado=false` (BORRADOR y anulado excluidos).
 *   - Orden determinístico `fechaContable ASC, numero ASC NULLS LAST, comprobanteId ASC, orden ASC`.
 *   - Aislamiento por tenant (Anti-31).
 *   - `listarPorAnclas` resuelve anclas puntuales SIN filtrar por anulado/estado (diagnóstico).
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/comprobantes/adapters/prisma-lineas-cuenta-reader
 */
describe('PrismaLineasCuentaReaderAdapter (integration vs Postgres)', () => {
  const SLUG_A = 'org-test-lineas-cuenta-a';
  const SLUG_B = 'org-test-lineas-cuenta-b';

  let prisma: PrismaClient;
  let adapter: PrismaLineasCuentaReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let cuentaBancoA: string;
  let cuentaOtraA: string;
  let cuentaBancoB: string;
  let periodoA: string;
  let periodoB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaLineasCuentaReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    [cuentaBancoA, cuentaOtraA, cuentaBancoB] = await Promise.all([
      crearCuenta(tenantA, '1.1.1.002'),
      crearCuenta(tenantA, '1.1.1.003'),
      crearCuenta(tenantB, '1.1.1.002'),
    ]);

    [periodoA, periodoB] = await Promise.all([crearPeriodo(tenantA), crearPeriodo(tenantB)]);
  });

  async function crearCuenta(organizationId: string, codigoInterno: string): Promise<string> {
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre: `Cuenta ${codigoInterno}`,
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    return cuenta.id;
  }

  async function crearPeriodo(organizationId: string): Promise<string> {
    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId, year: 2026, mesInicio: 1, status: GestionFiscalStatus.ABIERTA },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId,
        gestionId: gestion.id,
        year: 2026,
        month: 6,
        ordenEnGestion: 6,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    return periodo.id;
  }

  interface LineaInput {
    cuentaId: string;
    orden: number;
    debito?: string;
    credito?: string;
  }

  async function crearComprobante(
    organizationId: string,
    periodoFiscalId: string,
    opts: {
      dia: number;
      numero: string | null;
      estado: EstadoComprobante;
      anulado?: boolean;
      glosa?: string;
      lineas: LineaInput[];
    },
  ): Promise<string> {
    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId,
        tipo: TipoComprobante.DIARIO,
        numero: opts.numero,
        estado: opts.estado,
        anulado: opts.anulado ?? false,
        fechaContable: new Date(Date.UTC(2026, 5, opts.dia)),
        periodoFiscalId,
        glosa: opts.glosa ?? 'Glosa de cabecera',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('0.00'),
        totalCreditoBob: new Prisma.Decimal('0.00'),
        createdByUserId: 'user-test',
        lineas: {
          create: opts.lineas.map((l) => ({
            organizationId,
            orden: l.orden,
            cuentaId: l.cuentaId,
            moneda: Moneda.BOB,
            debito: new Prisma.Decimal(l.debito ?? '0'),
            credito: new Prisma.Decimal(l.credito ?? '0'),
            tipoCambio: new Prisma.Decimal('1'),
            debitoBob: new Prisma.Decimal(l.debito ?? '0'),
            creditoBob: new Prisma.Decimal(l.credito ?? '0'),
            glosaLinea: `Línea ${l.orden}`,
          })),
        },
      },
    });
    return comprobante.id;
  }

  const RANGO = {
    fechaDesde: new Date(Date.UTC(2026, 5, 1)),
    fechaHasta: new Date(Date.UTC(2026, 5, 30)),
  };

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.lineaComprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.periodoFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.gestionFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  // ==========================================================
  // listarPorCuentaEnRango — filtros de estado / anulado
  // ==========================================================

  it('devuelve solo líneas CONTABILIZADO y BLOQUEADO con anulado=false', async () => {
    await crearComprobante(tenantA, periodoA, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '100.00' }],
    });
    await crearComprobante(tenantA, periodoA, {
      dia: 11,
      numero: 'D2606-000002',
      estado: EstadoComprobante.BLOQUEADO,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, credito: '200.00' }],
    });
    await crearComprobante(tenantA, periodoA, {
      dia: 12,
      numero: null,
      estado: EstadoComprobante.BORRADOR,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '300.00' }],
    });
    await crearComprobante(tenantA, periodoA, {
      dia: 13,
      numero: 'D2606-000003',
      estado: EstadoComprobante.CONTABILIZADO,
      anulado: true,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '400.00' }],
    });

    const filas = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoA,
      ...RANGO,
    });

    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.numeroComprobante)).toEqual(['D2606-000001', 'D2606-000002']);
    expect(filas.every((f) => f.anulado === false)).toBe(true);
  });

  it('excluye líneas de OTRA cuenta del mismo comprobante y de fechas fuera del rango', async () => {
    await crearComprobante(tenantA, periodoA, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [
        { cuentaId: cuentaBancoA, orden: 1, debito: '100.00' },
        { cuentaId: cuentaOtraA, orden: 2, credito: '100.00' },
      ],
    });

    const dentro = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoA,
      ...RANGO,
    });
    expect(dentro).toHaveLength(1);
    expect(dentro[0]!.orden).toBe(1);

    const fuera = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoA,
      fechaDesde: new Date(Date.UTC(2026, 6, 1)),
      fechaHasta: new Date(Date.UTC(2026, 6, 31)),
    });
    expect(fuera).toEqual([]);
  });

  it('proyecta monto en moneda ORIGINAL, glosa de cabecera y glosa de línea', async () => {
    await crearComprobante(tenantA, periodoA, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      glosa: 'Depósito de clientes',
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '1250.50' }],
    });

    const [fila] = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoA,
      ...RANGO,
    });

    expect(fila).toBeDefined();
    expect(fila!.debito.toFixed(2)).toBe('1250.50');
    expect(fila!.credito.toFixed(2)).toBe('0.00');
    expect(fila!.debitoBob.toFixed(2)).toBe('1250.50');
    expect(fila!.moneda).toBe(Moneda.BOB);
    expect(fila!.glosa).toBe('Depósito de clientes');
    expect(fila!.glosaLinea).toBe('Línea 1');
    expect(fila!.cuentaId).toBe(cuentaBancoA);
    expect(fila!.estado).toBe(EstadoComprobante.CONTABILIZADO);
    expect(fila!.fechaContable.toISOString().slice(0, 10)).toBe('2026-06-10');
  });

  // ==========================================================
  // listarPorCuentaEnRango — orden determinístico
  // ==========================================================

  it('orden determinístico: fechaContable ASC, numero ASC NULLS LAST, comprobanteId ASC, orden ASC', async () => {
    // Insertados a propósito en orden inverso al esperado.
    await crearComprobante(tenantA, periodoA, {
      dia: 20,
      numero: 'D2606-000009',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [
        { cuentaId: cuentaBancoA, orden: 2, credito: '20.00' },
        { cuentaId: cuentaBancoA, orden: 1, debito: '10.00' },
      ],
    });
    await crearComprobante(tenantA, periodoA, {
      dia: 5,
      numero: 'D2606-000002',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '30.00' }],
    });
    await crearComprobante(tenantA, periodoA, {
      dia: 5,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '40.00' }],
    });

    const filas = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoA,
      ...RANGO,
    });

    expect(
      filas.map(
        (f) => `${f.fechaContable.toISOString().slice(0, 10)}|${f.numeroComprobante}|${f.orden}`,
      ),
    ).toEqual([
      '2026-06-05|D2606-000001|1',
      '2026-06-05|D2606-000002|1',
      '2026-06-20|D2606-000009|1',
      '2026-06-20|D2606-000009|2',
    ]);
  });

  // ==========================================================
  // Aislamiento por tenant (Anti-31)
  // ==========================================================

  it('nunca devuelve líneas de otro tenant, ni siquiera pasando su cuentaId', async () => {
    await crearComprobante(tenantB, periodoB, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [{ cuentaId: cuentaBancoB, orden: 1, debito: '999.00' }],
    });
    await crearComprobante(tenantA, periodoA, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '111.00' }],
    });

    const conCuentaAjena = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoB,
      ...RANGO,
    });
    expect(conCuentaAjena).toEqual([]);

    const propias = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoA,
      ...RANGO,
    });
    expect(propias).toHaveLength(1);
    expect(propias[0]!.debito.toFixed(2)).toBe('111.00');
  });

  // ==========================================================
  // listarPorAnclas — diagnóstico, SIN filtro de estado/anulado
  // ==========================================================

  it('listarPorAnclas resuelve anclas de comprobantes ANULADOS y BORRADOR (diagnóstico)', async () => {
    const anulado = await crearComprobante(tenantA, periodoA, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      anulado: true,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '100.00' }],
    });
    const borrador = await crearComprobante(tenantA, periodoA, {
      dia: 11,
      numero: null,
      estado: EstadoComprobante.BORRADOR,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '200.00' }],
    });

    // Confirmación de contraste: el listado por rango NO los trae.
    const porRango = await adapter.listarPorCuentaEnRango(tenantA, {
      cuentaId: cuentaBancoA,
      ...RANGO,
    });
    expect(porRango).toEqual([]);

    const filas = await adapter.listarPorAnclas(tenantA, [
      { comprobanteId: anulado, orden: 1 },
      { comprobanteId: borrador, orden: 1 },
    ]);

    expect(filas).toHaveLength(2);
    const porComprobante = new Map(filas.map((f) => [f.comprobanteId, f]));
    expect(porComprobante.get(anulado)!.anulado).toBe(true);
    expect(porComprobante.get(borrador)!.estado).toBe(EstadoComprobante.BORRADOR);
  });

  it('listarPorAnclas omite las anclas que no resuelven y respeta el tenant', async () => {
    const comprobanteB = await crearComprobante(tenantB, periodoB, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [{ cuentaId: cuentaBancoB, orden: 1, debito: '100.00' }],
    });
    const comprobanteA = await crearComprobante(tenantA, periodoA, {
      dia: 10,
      numero: 'D2606-000001',
      estado: EstadoComprobante.CONTABILIZADO,
      lineas: [{ cuentaId: cuentaBancoA, orden: 1, debito: '100.00' }],
    });

    const filas = await adapter.listarPorAnclas(tenantA, [
      { comprobanteId: comprobanteA, orden: 1 },
      { comprobanteId: comprobanteA, orden: 99 }, // orden inexistente
      { comprobanteId: comprobanteB, orden: 1 }, // otro tenant
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0]!.comprobanteId).toBe(comprobanteA);
  });

  it('listarPorAnclas con lista vacía no consulta y devuelve []', async () => {
    expect(await adapter.listarPorAnclas(tenantA, [])).toEqual([]);
  });
});
