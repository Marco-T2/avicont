import {
  ClaseCuenta,
  EstadoComprobante,
  Moneda,
  NaturalezaCuenta,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaLibroMayorReaderAdapter } from './prisma-libro-mayor-reader.adapter';

/**
 * Integration spec del adapter `PrismaLibroMayorReaderAdapter` contra Postgres real.
 *
 * Valida:
 *   - aislamiento multi-tenant CRÍTICO (2 tenants, §4.2 CLAUDE.md, Anti-31)
 *   - exclusión de BORRADOR siempre (REQ-LM-02)
 *   - toggle de anulados (REQ-LM-03)
 *   - saldo inicial histórico por cuenta (REQ-LM-04)
 *   - orden determinístico de movimientos (REQ-LM-05)
 *   - contarMovimientos para tope (REQ-LM-12)
 *   - validación de cuenta de detalle (REQ-LM-07)
 */
describe('PrismaLibroMayorReaderAdapter (integration)', () => {
  const SLUG_A = 'org-mayor-reader-a';
  const SLUG_B = 'org-mayor-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaLibroMayorReaderAdapter;
  let tenantA: string;
  let tenantB: string;

  // IDs de cuentas (tenant A)
  let cajaAId: string;
  let ventasAId: string;
  let agrupadAId: string; // cuenta agrupadora para test de detalle

  // IDs de cuentas (tenant B)
  let cajaBId: string;
  let ventasBId: string;

  let periodoAId: string;
  let periodoBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaLibroMayorReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Mayor A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Mayor B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const [gestionA, gestionB] = await Promise.all([
      prisma.gestionFiscal.create({ data: { organizationId: tenantA, year: 2026, mesInicio: 1 } }),
      prisma.gestionFiscal.create({ data: { organizationId: tenantB, year: 2026, mesInicio: 1 } }),
    ]);

    const [pA, pB] = await Promise.all([
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: gestionA.id,
          year: 2026,
          month: 1,
          ordenEnGestion: 1,
          status: 'ABIERTO',
        },
      }),
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantB,
          gestionId: gestionB.id,
          year: 2026,
          month: 1,
          ordenEnGestion: 1,
          status: 'ABIERTO',
        },
      }),
    ]);
    periodoAId = pA.id;
    periodoBId = pB.id;

    // Cuentas para tenant A
    const [cA, vA, agrupA, cB, vB] = await Promise.all([
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
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      // Cuenta agrupadora (esDetalle=false) para test REQ-LM-07
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.1',
          nombre: 'Activo Corriente',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 2,
          esDetalle: false,
        },
      }),
      // Tenant B cuentas (mismos códigos que A — para probar multi-tenant)
      prisma.cuenta.create({
        data: {
          organizationId: tenantB,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN B',
          claseCuenta: ClaseCuenta.ACTIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantB,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas B',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);
    cajaAId = cA.id;
    ventasAId = vA.id;
    agrupadAId = agrupA.id;
    cajaBId = cB.id;
    ventasBId = vB.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.lineaComprobante.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
  }

  /**
   * Crea un asiento CONTABILIZADO con un movimiento en la cuenta indicada.
   * Una línea en `cuentaDebeId` (debe) y otra en `cuentaHaberId` (haber).
   */
  async function crearMovimientoContabilizado(
    tenantId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    fecha: Date,
    importe: number = 1000,
    anulado = false,
    numero?: string,
    estado: EstadoComprobante = EstadoComprobante.CONTABILIZADO,
  ) {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        estado,
        numero: numero ?? `D${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: fecha,
        periodoFiscalId: periodoId,
        glosa: 'Asiento de prueba LM',
        totalDebitoBob: importe,
        totalCreditoBob: importe,
        createdByUserId: 'user-test',
        anulado,
      },
    });

    await prisma.lineaComprobante.createMany({
      data: [
        {
          organizationId: tenantId,
          comprobanteId: comp.id,
          orden: 1,
          cuentaId: cuentaDebeId,
          moneda: Moneda.BOB,
          debito: importe,
          credito: 0,
          debitoBob: importe,
          creditoBob: 0,
        },
        {
          organizationId: tenantId,
          comprobanteId: comp.id,
          orden: 2,
          cuentaId: cuentaHaberId,
          moneda: Moneda.BOB,
          debito: 0,
          credito: importe,
          debitoBob: 0,
          creditoBob: importe,
        },
      ],
    });

    return comp;
  }

  const filtrosEnero = {
    fechaDesde: new Date(Date.UTC(2026, 0, 1)),
    fechaHasta: new Date(Date.UTC(2026, 0, 31)),
    incluirAnulados: false,
  };

  // ============================================================
  // contarMovimientos (REQ-LM-12)
  // ============================================================

  describe('contarMovimientos', () => {
    it('cuenta solo líneas de CONTABILIZADO/BLOQUEADO, excluye BORRADOR', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      // Borrador — no debe contar
      await prisma.comprobante.create({
        data: {
          organizationId: tenantA,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BORRADOR,
          fechaContable: new Date(Date.UTC(2026, 0, 6)),
          periodoFiscalId: periodoAId,
          glosa: 'Borrador',
          createdByUserId: 'user-test',
        },
      });

      const count = await adapter.contarMovimientos(tenantA, filtrosEnero);
      // 1 comprobante CONTABILIZADO con 2 líneas = 2
      expect(count).toBe(2);
    });

    it('respeta incluirAnulados: sin flag excluye anulados; con flag los incluye', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 6)),
        1000,
        true, // anulado
      );

      const sinAnulados = await adapter.contarMovimientos(tenantA, filtrosEnero);
      expect(sinAnulados).toBe(2); // solo el primero (2 líneas)

      const conAnulados = await adapter.contarMovimientos(tenantA, {
        ...filtrosEnero,
        incluirAnulados: true,
      });
      expect(conAnulados).toBe(4); // dos comprobantes × 2 líneas
    });

    it('respeta cuentaId: cuenta solo líneas de esa cuenta', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );

      const soloVentas = await adapter.contarMovimientos(tenantA, {
        ...filtrosEnero,
        cuentaId: ventasAId,
      });
      expect(soloVentas).toBe(1); // solo la línea de ventas
    });

    it('CRÍTICO — aislamiento multi-tenant: counts separados por tenant', async () => {
      // Tenant A: 1 asiento (2 líneas)
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      // Tenant B: 2 asientos (4 líneas)
      await crearMovimientoContabilizado(
        tenantB,
        periodoBId,
        cajaBId,
        ventasBId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearMovimientoContabilizado(
        tenantB,
        periodoBId,
        cajaBId,
        ventasBId,
        new Date(Date.UTC(2026, 0, 6)),
      );

      const countA = await adapter.contarMovimientos(tenantA, filtrosEnero);
      const countB = await adapter.contarMovimientos(tenantB, filtrosEnero);

      expect(countA).toBe(2);
      expect(countB).toBe(4);
    });
  });

  // ============================================================
  // obtenerMovimientos (REQ-LM-02, REQ-LM-03, REQ-LM-05, REQ-LM-09)
  // ============================================================

  describe('obtenerMovimientos', () => {
    it('BORRADOR nunca aparece en movimientos (REQ-LM-02)', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 10)),
      );
      await prisma.comprobante.create({
        data: {
          organizationId: tenantA,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BORRADOR,
          fechaContable: new Date(Date.UTC(2026, 0, 10)),
          periodoFiscalId: periodoAId,
          glosa: 'Borrador LM',
          createdByUserId: 'user-test',
        },
      });

      const rows = await adapter.obtenerMovimientos(tenantA, filtrosEnero);
      expect(rows.every((r) => r.estado !== 'BORRADOR')).toBe(true);
      expect(rows).toHaveLength(2);
    });

    it('sin incluirAnulados: anulados excluidos; con flag: incluidos (REQ-LM-03)', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 6)),
        1000,
        true, // anulado
      );

      const sinAnulados = await adapter.obtenerMovimientos(tenantA, filtrosEnero);
      expect(sinAnulados).toHaveLength(2); // solo las 2 líneas del primer asiento

      const conAnulados = await adapter.obtenerMovimientos(tenantA, {
        ...filtrosEnero,
        incluirAnulados: true,
      });
      expect(conAnulados).toHaveLength(4);
      expect(conAnulados.some((r) => r.anulado)).toBe(true);
    });

    it('orden determinístico: cuentaId → fechaContable ASC → numero ASC NULLS LAST (REQ-LM-05)', async () => {
      const mismaFecha = new Date(Date.UTC(2026, 0, 20));

      // Insertar en orden inverso al esperado
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        mismaFecha,
        1000,
        false,
        'D2601-000020',
      );
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        mismaFecha,
        1000,
        false,
        'D2601-000010',
      );

      const rows = await adapter.obtenerMovimientos(tenantA, filtrosEnero);

      // Caja (debe): D2601-000010 primero, luego D2601-000020
      const cajaRows = rows.filter((r) => r.cuentaId === cajaAId);
      expect(cajaRows[0]!.numeroComprobante).toBe('D2601-000010');
      expect(cajaRows[1]!.numeroComprobante).toBe('D2601-000020');
    });

    it('CRÍTICO — aislamiento multi-tenant: query de Tenant A devuelve SOLO movimientos de Tenant A (REQ-LM-09)', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );
      await crearMovimientoContabilizado(
        tenantB,
        periodoBId,
        cajaBId,
        ventasBId,
        new Date(Date.UTC(2026, 0, 5)),
        5000, // importe diferente para distinguir
      );

      const rowsA = await adapter.obtenerMovimientos(tenantA, filtrosEnero);
      const rowsB = await adapter.obtenerMovimientos(tenantB, filtrosEnero);

      // Tenant A solo ve sus movimientos
      expect(rowsA.every((r) => r.cuentaId === cajaAId || r.cuentaId === ventasAId)).toBe(true);
      // Tenant B solo ve los suyos
      expect(rowsB.every((r) => r.cuentaId === cajaBId || r.cuentaId === ventasBId)).toBe(true);
      // Importes no se mezclan
      expect(
        rowsA.every((r) => r.debitoBob.toNumber() === 1000 || r.creditoBob.toNumber() === 1000),
      ).toBe(true);
      expect(
        rowsB.every((r) => r.debitoBob.toNumber() === 5000 || r.creditoBob.toNumber() === 5000),
      ).toBe(true);
    });

    it('filtra por cuentaId cuando está presente', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );

      const soloVentas = await adapter.obtenerMovimientos(tenantA, {
        ...filtrosEnero,
        cuentaId: ventasAId,
      });

      expect(soloVentas.every((r) => r.cuentaId === ventasAId)).toBe(true);
      expect(soloVentas).toHaveLength(1);
    });

    it('proyecta campos correctos: naturaleza, glosaLinea null, Decimal', async () => {
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
      );

      const rows = await adapter.obtenerMovimientos(tenantA, filtrosEnero);

      // Caja: DEUDORA, debitoBob=1000
      const cajaRow = rows.find((r) => r.cuentaId === cajaAId);
      expect(cajaRow).toBeDefined();
      expect(cajaRow!.naturaleza).toBe(NaturalezaCuenta.DEUDORA);
      expect(cajaRow!.glosaLinea).toBeNull();
      expect(typeof cajaRow!.debitoBob.toFixed).toBe('function'); // es Decimal
      expect(cajaRow!.debitoBob.toNumber()).toBe(1000);
    });
  });

  // ============================================================
  // obtenerSaldosIniciales (REQ-LM-04, REQ-LM-09)
  // ============================================================

  describe('obtenerSaldosIniciales', () => {
    it('incluye solo líneas con fechaContable < fechaDesde (saldo histórico)', async () => {
      // Asiento en diciembre 2025 (antes del rango de enero 2026)
      const diciembrePeriodo = await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: (
            await prisma.gestionFiscal.findFirstOrThrow({ where: { organizationId: tenantA } })
          ).id,
          year: 2025,
          month: 12,
          ordenEnGestion: 12,
          status: 'CERRADO',
        },
      });
      await crearMovimientoContabilizado(
        tenantA,
        diciembrePeriodo.id,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2025, 11, 15)), // diciembre 2025
        800,
      );
      // Asiento en enero 2026 (dentro del rango — NO debe estar en saldo inicial)
      await crearMovimientoContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2026, 0, 5)),
        1000,
      );

      const saldos = await adapter.obtenerSaldosIniciales(tenantA, filtrosEnero);

      // Solo la caja y ventas del asiento de diciembre
      expect(saldos.length).toBeGreaterThan(0);
      const cajaSaldo = saldos.find((s) => s.cuentaId === cajaAId);
      expect(cajaSaldo).toBeDefined();
      expect(cajaSaldo!.totalDebitoBob.toNumber()).toBe(800);
      expect(cajaSaldo!.totalCreditoBob.toNumber()).toBe(0);
    });

    it('BORRADOR excluido del saldo inicial (REQ-LM-02)', async () => {
      // Borrador en diciembre 2025 — NO debe aparecer en saldo inicial
      const diciembrePeriodo = await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: (
            await prisma.gestionFiscal.findFirstOrThrow({ where: { organizationId: tenantA } })
          ).id,
          year: 2025,
          month: 12,
          ordenEnGestion: 12,
          status: 'CERRADO',
        },
      });
      await prisma.comprobante.create({
        data: {
          organizationId: tenantA,
          tipo: TipoComprobante.DIARIO,
          estado: EstadoComprobante.BORRADOR,
          fechaContable: new Date(Date.UTC(2025, 11, 15)),
          periodoFiscalId: diciembrePeriodo.id,
          glosa: 'Borrador diciembre',
          createdByUserId: 'user-test',
        },
      });

      const saldos = await adapter.obtenerSaldosIniciales(tenantA, filtrosEnero);
      expect(saldos).toHaveLength(0);
    });

    it('CRÍTICO — multi-tenant: saldosIniciales de Tenant A no incluye movimientos de Tenant B (REQ-LM-09)', async () => {
      const periodoA2025 = await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: (
            await prisma.gestionFiscal.findFirstOrThrow({ where: { organizationId: tenantA } })
          ).id,
          year: 2025,
          month: 12,
          ordenEnGestion: 12,
          status: 'CERRADO',
        },
      });
      const periodoB2025 = await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantB,
          gestionId: (
            await prisma.gestionFiscal.findFirstOrThrow({ where: { organizationId: tenantB } })
          ).id,
          year: 2025,
          month: 12,
          ordenEnGestion: 12,
          status: 'CERRADO',
        },
      });

      // Tenant A: 800 antes del rango
      await crearMovimientoContabilizado(
        tenantA,
        periodoA2025.id,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2025, 11, 15)),
        800,
      );
      // Tenant B: 9000 antes del rango
      await crearMovimientoContabilizado(
        tenantB,
        periodoB2025.id,
        cajaBId,
        ventasBId,
        new Date(Date.UTC(2025, 11, 15)),
        9000,
      );

      const saldosA = await adapter.obtenerSaldosIniciales(tenantA, filtrosEnero);
      const cajaSaldoA = saldosA.find((s) => s.cuentaId === cajaAId);
      expect(cajaSaldoA!.totalDebitoBob.toNumber()).toBe(800); // Solo A, no B

      const saldosB = await adapter.obtenerSaldosIniciales(tenantB, filtrosEnero);
      const cajaSaldoB = saldosB.find((s) => s.cuentaId === cajaBId);
      expect(cajaSaldoB!.totalDebitoBob.toNumber()).toBe(9000); // Solo B, no A
    });

    it('cuentaId presente: devuelve solo la fila de esa cuenta', async () => {
      const periodoA2025 = await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: (
            await prisma.gestionFiscal.findFirstOrThrow({ where: { organizationId: tenantA } })
          ).id,
          year: 2025,
          month: 12,
          ordenEnGestion: 12,
          status: 'CERRADO',
        },
      });
      await crearMovimientoContabilizado(
        tenantA,
        periodoA2025.id,
        cajaAId,
        ventasAId,
        new Date(Date.UTC(2025, 11, 15)),
        800,
      );

      const saldos = await adapter.obtenerSaldosIniciales(tenantA, {
        ...filtrosEnero,
        cuentaId: ventasAId,
      });

      expect(saldos).toHaveLength(1);
      expect(saldos[0]!.cuentaId).toBe(ventasAId);
    });

    it('cuenta sin historial previo → no aparece en el resultado', async () => {
      // Sin movimientos previos al rango, el saldo inicial es vacío
      const saldos = await adapter.obtenerSaldosIniciales(tenantA, filtrosEnero);
      expect(saldos).toHaveLength(0);
    });
  });

  // ============================================================
  // obtenerCuentaDetalle (REQ-LM-07)
  // ============================================================

  describe('obtenerCuentaDetalle', () => {
    it('devuelve { id, esDetalle: true } para cuenta de detalle del tenant', async () => {
      const result = await adapter.obtenerCuentaDetalle(tenantA, cajaAId);

      expect(result).toBeDefined();
      expect(result!.id).toBe(cajaAId);
      expect(result!.esDetalle).toBe(true);
    });

    it('devuelve cuenta con esDetalle: false para cuenta agrupadora del tenant', async () => {
      const result = await adapter.obtenerCuentaDetalle(tenantA, agrupadAId);

      expect(result).toBeDefined();
      expect(result!.id).toBe(agrupadAId);
      expect(result!.esDetalle).toBe(false);
    });

    it('devuelve null si el cuentaId no existe', async () => {
      const result = await adapter.obtenerCuentaDetalle(
        tenantA,
        'a1b2c3d4-e5f6-4a7b-8c9d-000000000000',
      );
      expect(result).toBeNull();
    });

    it('devuelve null si el cuentaId pertenece a otro tenant (defense in depth §4.2)', async () => {
      // cajaAId pertenece a tenantA — si tenantB lo consulta, debe recibir null
      const result = await adapter.obtenerCuentaDetalle(tenantB, cajaAId);
      expect(result).toBeNull();
    });
  });
});
