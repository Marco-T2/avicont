import {
  ClaseCuenta,
  EstadoComprobante,
  Moneda,
  NaturalezaCuenta,
  PrismaClient,
  SubClaseCuenta,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaBalanceReaderAdapter } from './prisma-balance-reader.adapter';

/**
 * Integration spec del adapter `PrismaBalanceReaderAdapter` contra Postgres real.
 *
 * Valida:
 *   - aislamiento multi-tenant CRÍTICO (2 tenants, §4.2 CLAUDE.md, Anti-31)
 *   - exclusión de BORRADOR siempre (REQ-BG-03)
 *   - toggle de anulados (REQ-BG-04)
 *   - corte de fecha: ≤ fechaCorte incluido, > fechaCorte excluido
 *   - obtenerSaldosEnRango: solo el rango indicado
 *   - obtenerEstructuraCuentas: agrupadoras sin movimiento; activa=false excluida;
 *     cuenta esContraria=true presente con el flag correcto
 */
describe('PrismaBalanceReaderAdapter (integration)', () => {
  const SLUG_A = 'org-balance-reader-a';
  const SLUG_B = 'org-balance-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaBalanceReaderAdapter;
  let tenantA: string;
  let tenantB: string;

  // Cuentas tenant A
  let cajaAId: string;
  let ventasAId: string;
  let agrupadAId: string;
  let depreciacionAId: string; // esContraria=true

  // Cuentas tenant B
  let cajaBId: string;
  let ventasBId: string;

  let periodoAId: string;
  let periodoBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaBalanceReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Balance A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Balance B' } }),
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

    // Cuentas tenant A
    const [cAJ, vA, agrupA, depA, cBJ, vB] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN A',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas A',
          claseCuenta: ClaseCuenta.INGRESO,
          subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      // Agrupadora sin movimiento (para verificar que aparece en estructura)
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.1',
          nombre: 'Activo Corriente A',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 2,
          esDetalle: false,
        },
      }),
      // Cuenta esContraria=true
      prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.2.1.002',
          nombre: 'Depreciación Acumulada A',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
          esContraria: true,
        },
      }),
      // Tenant B — mismos códigos que A (para probar multi-tenant)
      prisma.cuenta.create({
        data: {
          organizationId: tenantB,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja MN B',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
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
          subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);
    cajaAId = cAJ.id;
    ventasAId = vA.id;
    agrupadAId = agrupA.id;
    depreciacionAId = depA.id;
    cajaBId = cBJ.id;
    ventasBId = vB.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.lineaComprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  /**
   * Crea un comprobante con 2 líneas: debe → cuentaDebeId, haber → cuentaHaberId.
   */
  async function crearComprobanteContabilizado(
    tenantId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    fecha: Date,
    montoBob = 1000,
    anulado = false,
    estado: EstadoComprobante = EstadoComprobante.CONTABILIZADO,
  ) {
    const comp = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        estado,
        numero: `D${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`,
        fechaContable: fecha,
        periodoFiscalId: periodoId,
        glosa: 'Asiento de prueba Balance',
        totalDebitoBob: montoBob,
        totalCreditoBob: montoBob,
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
          debito: montoBob,
          credito: 0,
          debitoBob: montoBob,
          creditoBob: 0,
        },
        {
          organizationId: tenantId,
          comprobanteId: comp.id,
          orden: 2,
          cuentaId: cuentaHaberId,
          moneda: Moneda.BOB,
          debito: 0,
          credito: montoBob,
          debitoBob: 0,
          creditoBob: montoBob,
        },
      ],
    });

    return comp;
  }

  // ============================================================
  // obtenerSaldosHasta (REQ-BG-03, REQ-BG-04, REQ-BG-12)
  // ============================================================

  describe('obtenerSaldosHasta', () => {
    it('CRÍTICO multi-tenant: query del Tenant A devuelve SOLO saldos del Tenant A (REQ-BG-12, Anti-31)', async () => {
      // Ambos tenants, misma fecha
      const fecha = new Date(Date.UTC(2026, 0, 15));
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, fecha, 5000);
      await crearComprobanteContabilizado(tenantB, periodoBId, cajaBId, ventasBId, fecha, 9999);

      const saldosA = await adapter.obtenerSaldosHasta(tenantA, {
        fechaCorte: new Date(Date.UTC(2026, 0, 31)),
        incluirAnulados: false,
      });

      // Solo debe haber saldos de las cuentas del tenant A
      const cuentaIds = saldosA.map((s) => s.cuentaId);
      expect(cuentaIds).not.toContain(cajaBId);
      expect(cuentaIds).not.toContain(ventasBId);
      expect(cuentaIds).toContain(cajaAId);
    });

    it('BORRADOR nunca aporta a los saldos (REQ-BG-03)', async () => {
      const fecha = new Date(Date.UTC(2026, 0, 10));
      // BORRADOR: no debe aparecer
      await crearComprobanteContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        fecha,
        5000,
        false,
        EstadoComprobante.BORRADOR,
      );

      const saldos = await adapter.obtenerSaldosHasta(tenantA, {
        fechaCorte: new Date(Date.UTC(2026, 0, 31)),
        incluirAnulados: false,
      });

      // No hay saldos — el borrador no debe aparecer
      expect(saldos).toHaveLength(0);
    });

    it('sin incluirAnulados: anulados excluidos; con flag: incluidos (REQ-BG-04)', async () => {
      const fecha = new Date(Date.UTC(2026, 0, 10));
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, fecha, 1000); // normal
      await crearComprobanteContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        fecha,
        500,
        true,
      ); // anulado

      // Sin incluirAnulados: solo el comprobante normal
      const sinAnulados = await adapter.obtenerSaldosHasta(tenantA, {
        fechaCorte: new Date(Date.UTC(2026, 0, 31)),
        incluirAnulados: false,
      });
      const cajaRow = sinAnulados.find((s) => s.cuentaId === cajaAId);
      expect(cajaRow).toBeDefined();
      expect(cajaRow!.totalDebitoBob.toNumber()).toBe(1000);

      // Con incluirAnulados: suma ambos
      const conAnulados = await adapter.obtenerSaldosHasta(tenantA, {
        fechaCorte: new Date(Date.UTC(2026, 0, 31)),
        incluirAnulados: true,
      });
      const cajaRowConAnulados = conAnulados.find((s) => s.cuentaId === cajaAId);
      expect(cajaRowConAnulados).toBeDefined();
      expect(cajaRowConAnulados!.totalDebitoBob.toNumber()).toBe(1500);
    });

    it('corte: línea con fechaContable > fechaCorte no suma; = fechaCorte sí suma', async () => {
      const dentroCorte = new Date(Date.UTC(2026, 0, 15));
      const fueraCorte = new Date(Date.UTC(2026, 0, 20));

      await crearComprobanteContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        dentroCorte,
        1000,
      );
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, fueraCorte, 500);

      const saldos = await adapter.obtenerSaldosHasta(tenantA, {
        fechaCorte: new Date(Date.UTC(2026, 0, 15)), // corte = 15-ene
        incluirAnulados: false,
      });

      const cajaRow = saldos.find((s) => s.cuentaId === cajaAId);
      expect(cajaRow).toBeDefined();
      // Solo la del día 15 (1000), la del día 20 queda fuera
      expect(cajaRow!.totalDebitoBob.toNumber()).toBe(1000);
    });

    it('COALESCE: cuenta sin movimientos no aparece en el array (el service la trata como 0)', async () => {
      // Sin ningún movimiento
      const saldos = await adapter.obtenerSaldosHasta(tenantA, {
        fechaCorte: new Date(Date.UTC(2026, 0, 31)),
        incluirAnulados: false,
      });

      expect(saldos).toHaveLength(0);
    });

    it('cuentas INGRESO también devueltas (necesarias para Resultado del Ejercicio)', async () => {
      const fecha = new Date(Date.UTC(2026, 0, 10));
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, fecha, 1000);

      const saldos = await adapter.obtenerSaldosHasta(tenantA, {
        fechaCorte: new Date(Date.UTC(2026, 0, 31)),
        incluirAnulados: false,
      });

      // Deben aparecer tanto la cuenta ACTIVO como la cuenta INGRESO
      const cuentaIds = saldos.map((s) => s.cuentaId);
      expect(cuentaIds).toContain(cajaAId);
      expect(cuentaIds).toContain(ventasAId);
    });
  });

  // ============================================================
  // obtenerSaldosEnRango (REQ-BG-09, REQ-BG-12)
  // ============================================================

  describe('obtenerSaldosEnRango', () => {
    it('líneas fuera del rango [desde, hasta] no aparecen', async () => {
      const dentro = new Date(Date.UTC(2026, 0, 15));
      const fuera = new Date(Date.UTC(2026, 1, 15)); // febrero

      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, dentro, 1000);
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, fuera, 500);

      const saldos = await adapter.obtenerSaldosEnRango(
        tenantA,
        new Date(Date.UTC(2026, 0, 1)),
        new Date(Date.UTC(2026, 0, 31)),
        false,
      );

      const cajaRow = saldos.find((s) => s.cuentaId === cajaAId);
      expect(cajaRow).toBeDefined();
      expect(cajaRow!.totalDebitoBob.toNumber()).toBe(1000);
    });

    it('desde inclusive, hasta inclusive', async () => {
      const desde = new Date(Date.UTC(2026, 0, 1));
      const hasta = new Date(Date.UTC(2026, 0, 31));

      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, desde, 100);
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, hasta, 200);

      const saldos = await adapter.obtenerSaldosEnRango(tenantA, desde, hasta, false);

      const cajaRow = saldos.find((s) => s.cuentaId === cajaAId);
      expect(cajaRow!.totalDebitoBob.toNumber()).toBe(300);
    });

    it('aislamiento multi-tenant análogo al de obtenerSaldosHasta', async () => {
      const fecha = new Date(Date.UTC(2026, 0, 15));
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, fecha, 5000);
      await crearComprobanteContabilizado(tenantB, periodoBId, cajaBId, ventasBId, fecha, 9999);

      const saldosA = await adapter.obtenerSaldosEnRango(
        tenantA,
        new Date(Date.UTC(2026, 0, 1)),
        new Date(Date.UTC(2026, 0, 31)),
        false,
      );

      const cuentaIds = saldosA.map((s) => s.cuentaId);
      expect(cuentaIds).not.toContain(cajaBId);
      expect(cuentaIds).not.toContain(ventasBId);
    });

    it('toggle incluirAnulados funciona igual que en obtenerSaldosHasta', async () => {
      const fecha = new Date(Date.UTC(2026, 0, 10));
      await crearComprobanteContabilizado(tenantA, periodoAId, cajaAId, ventasAId, fecha, 1000);
      await crearComprobanteContabilizado(
        tenantA,
        periodoAId,
        cajaAId,
        ventasAId,
        fecha,
        300,
        true,
      );

      const sinAnulados = await adapter.obtenerSaldosEnRango(
        tenantA,
        new Date(Date.UTC(2026, 0, 1)),
        new Date(Date.UTC(2026, 0, 31)),
        false,
      );
      const cajaRow = sinAnulados.find((s) => s.cuentaId === cajaAId);
      expect(cajaRow!.totalDebitoBob.toNumber()).toBe(1000);

      const conAnulados = await adapter.obtenerSaldosEnRango(
        tenantA,
        new Date(Date.UTC(2026, 0, 1)),
        new Date(Date.UTC(2026, 0, 31)),
        true,
      );
      const cajaConAnulados = conAnulados.find((s) => s.cuentaId === cajaAId);
      expect(cajaConAnulados!.totalDebitoBob.toNumber()).toBe(1300);
    });
  });

  // ============================================================
  // obtenerEstructuraCuentas (REQ-BG-06, REQ-BG-12)
  // ============================================================

  describe('obtenerEstructuraCuentas', () => {
    it('devuelve agrupadoras sin movimiento (son nodos estructurales del árbol)', async () => {
      const estructura = await adapter.obtenerEstructuraCuentas(tenantA);

      const agrupadora = estructura.find((c) => c.id === agrupadAId);
      expect(agrupadora).toBeDefined();
      expect(agrupadora!.esDetalle).toBe(false);
    });

    it('cuenta con activa=false es excluida', async () => {
      // Crear cuenta inactiva
      const cuentaInactiva = await prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '1.9.9.001',
          nombre: 'Cuenta Inactiva',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
          activa: false,
        },
      });

      const estructura = await adapter.obtenerEstructuraCuentas(tenantA);

      expect(estructura.find((c) => c.id === cuentaInactiva.id)).toBeUndefined();
    });

    it('cuenta con esContraria=true presente con el flag correcto', async () => {
      const estructura = await adapter.obtenerEstructuraCuentas(tenantA);

      const depA = estructura.find((c) => c.id === depreciacionAId);
      expect(depA).toBeDefined();
      expect(depA!.esContraria).toBe(true);
    });

    it('aislamiento multi-tenant: estructuras de Tenant A no mezclan con Tenant B', async () => {
      const estructuraA = await adapter.obtenerEstructuraCuentas(tenantA);

      const cuentaIds = estructuraA.map((c) => c.id);
      expect(cuentaIds).not.toContain(cajaBId);
      expect(cuentaIds).not.toContain(ventasBId);
    });
  });
});
