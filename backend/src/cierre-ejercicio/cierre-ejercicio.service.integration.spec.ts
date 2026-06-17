import {
  ClaseCuenta,
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  PrismaClient,
  SubClaseCuenta,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';
import { PrismaCierreComprobanteWriterAdapter } from '@/comprobantes/adapters/prisma-cierre-comprobante-writer.adapter';
import { PrismaEeffSaldosReaderAdapter } from '@/reportes/adapters/prisma-eeff-saldos-reader.adapter';

import { EeffCierreSaldosAdapter } from './adapters/eeff-cierre-saldos.adapter';
import { PrismaCierreConfigReaderAdapter } from './adapters/prisma-cierre-config-reader.adapter';
import { PrismaCierreGestionReaderAdapter } from './adapters/prisma-cierre-gestion-reader.adapter';
import { CierreEjercicioService } from './cierre-ejercicio.service';
import {
  CierreGestionCerradaError,
  CierreGestionNoEncontradaError,
  CierrePeriodoNoListoError,
  CierreSinResultadoError,
  CierreYaParcialmenteContabilizadoError,
} from './domain/cierre-errors';

/**
 * Integration spec de `CierreEjercicioService` contra Postgres real (§7.2),
 * 2 tenants. Cubre REQ-CE-02/03/05/07/08/09/11/12:
 *   - genera los 3 borradores con flags/slots/fecha correctos (utilidad y pérdida)
 *   - partida doble por comprobante
 *   - idempotencia: regenerar borra+recrea, sin duplicar (constraint @@unique)
 *   - rechazo si algún cierre está CONTABILIZADO
 *   - aislamiento multi-tenant (tenant B no toca la gestión de A)
 *   - gate de períodos (mesCierre cerrado → error)
 *   - sin movimiento → error
 */
describe('CierreEjercicioService (integration)', () => {
  const SLUG_A = 'org-cierre-a';
  const SLUG_B = 'org-cierre-b';

  let prisma: PrismaClient;
  let service: CierreEjercicioService;

  let tenantA: string;
  let tenantB: string;
  let gestionAId: string;
  let gestionBId: string;
  let mesCierreAId: string; // período 12 de A (ABIERTO)
  let periodoPrevioAId: string; // período 1 de A (donde van los movimientos)

  // Cuentas A
  let acumuladosAId: string; // 3.1.3.001
  let ventasAId: string;
  let costoAId: string;
  let sueldosAId: string;
  let cajaAId: string; // ACTIVO, contrapartida de los movimientos

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const eeffAdapter = new PrismaEeffSaldosReaderAdapter(prisma as unknown as PrismaService);
    service = new CierreEjercicioService(
      new PrismaCierreGestionReaderAdapter(prisma as unknown as PrismaService),
      new PrismaCierreConfigReaderAdapter(prisma as unknown as PrismaService),
      new EeffCierreSaldosAdapter(eeffAdapter),
      new PrismaCierreComprobanteWriterAdapter(prisma as unknown as PrismaService),
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    await seedUtilidad();
  });

  // ============================================================
  // Seeding
  // ============================================================

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const ids = orgs.map((o) => o.id);
    if (ids.length > 0) {
      await prisma.lineaComprobante.deleteMany({ where: { organizationId: { in: ids } } });
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: ids } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  async function crearCuentasDeResultado(tenantId: string) {
    const [transitoria, acumulados, ventas, costo, sueldos, caja] = await Promise.all([
      prisma.cuenta.create({
        data: {
          organizationId: tenantId,
          codigoInterno: '3.1.4.001',
          nombre: 'RESULTADO DE LA GESTIÓN',
          claseCuenta: ClaseCuenta.PATRIMONIO,
          subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantId,
          codigoInterno: '3.1.3.001',
          nombre: 'RESULTADOS ACUMULADOS',
          claseCuenta: ClaseCuenta.PATRIMONIO,
          subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantId,
          codigoInterno: '4.1.1.001',
          nombre: 'Ventas',
          claseCuenta: ClaseCuenta.INGRESO,
          subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantId,
          codigoInterno: '5.1.1.001',
          nombre: 'Costo de ventas',
          claseCuenta: ClaseCuenta.EGRESO,
          subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantId,
          codigoInterno: '5.2.1.001',
          nombre: 'Sueldos',
          claseCuenta: ClaseCuenta.EGRESO,
          subClaseCuenta: SubClaseCuenta.EGRESO_ADMINISTRATIVO,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
      prisma.cuenta.create({
        data: {
          organizationId: tenantId,
          codigoInterno: '1.1.1.001',
          nombre: 'Caja',
          claseCuenta: ClaseCuenta.ACTIVO,
          subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
          naturaleza: NaturalezaCuenta.DEUDORA,
          nivel: 4,
          esDetalle: true,
        },
      }),
    ]);

    await prisma.orgConfiguracionContable.create({
      data: {
        organizationId: tenantId,
        resultadoEjercicioId: transitoria.id,
        resultadosAcumuladosId: acumulados.id,
      },
    });

    return {
      transitoria: transitoria.id,
      acumulados: acumulados.id,
      ventas: ventas.id,
      costo: costo.id,
      sueldos: sueldos.id,
      caja: caja.id,
    };
  }

  /**
   * Crea una gestión 2026 con 12 períodos: los 11 primeros CERRADO y el 12 (mesCierre)
   * ABIERTO. Devuelve los ids de mesCierre y del período 1 (para movimientos).
   */
  async function crearGestion(tenantId: string): Promise<{
    gestionId: string;
    mesCierreId: string;
    periodo1Id: string;
  }> {
    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year: 2026,
        mesInicio: 1,
        status: GestionFiscalStatus.ABIERTA,
      },
    });

    let mesCierreId = '';
    let periodo1Id = '';
    for (let mes = 1; mes <= 12; mes += 1) {
      const periodo = await prisma.periodoFiscal.create({
        data: {
          organizationId: tenantId,
          gestionId: gestion.id,
          year: 2026,
          month: mes,
          ordenEnGestion: mes,
          status: mes === 12 ? PeriodoFiscalStatus.ABIERTO : PeriodoFiscalStatus.CERRADO,
        },
      });
      if (mes === 12) mesCierreId = periodo.id;
      if (mes === 1) periodo1Id = periodo.id;
    }
    return { gestionId: gestion.id, mesCierreId, periodo1Id };
  }

  /**
   * Comprobante CONTABILIZADO de 2 líneas en BOB: debe → cuentaDebeId, haber → cuentaHaberId.
   */
  async function crearMovimiento(
    tenantId: string,
    periodoId: string,
    cuentaDebeId: string,
    cuentaHaberId: string,
    montoBob: number,
  ) {
    const monto = montoBob.toFixed(2);
    await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 0, 15)),
        periodoFiscalId: periodoId,
        glosa: 'Movimiento de prueba',
        monedaPrincipal: Moneda.BOB,
        createdByUserId: 'user-seed',
        numero: `D2601-${Math.floor(Math.random() * 900000 + 100000)}`,
        totalDebitoBob: monto,
        totalCreditoBob: monto,
        lineas: {
          create: [
            {
              organizationId: tenantId,
              orden: 1,
              cuentaId: cuentaDebeId,
              moneda: Moneda.BOB,
              debito: monto,
              credito: '0',
              tipoCambio: '1',
              debitoBob: monto,
              creditoBob: '0',
            },
            {
              organizationId: tenantId,
              orden: 2,
              cuentaId: cuentaHaberId,
              moneda: Moneda.BOB,
              debito: '0',
              credito: monto,
              tipoCambio: '1',
              debitoBob: '0',
              creditoBob: monto,
            },
          ],
        },
      },
    });
  }

  /** Tenant A con utilidad (Ventas 100k, Costo 60k, Sueldos 20k → +20k) + tenant B vacío. */
  async function seedUtilidad() {
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Cierre A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Cierre B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const ctas = await crearCuentasDeResultado(tenantA);
    acumuladosAId = ctas.acumulados;
    ventasAId = ctas.ventas;
    costoAId = ctas.costo;
    sueldosAId = ctas.sueldos;
    cajaAId = ctas.caja;

    const gA = await crearGestion(tenantA);
    gestionAId = gA.gestionId;
    mesCierreAId = gA.mesCierreId;
    periodoPrevioAId = gA.periodo1Id;

    const gB = await crearGestion(tenantB);
    gestionBId = gB.gestionId;
    await crearCuentasDeResultado(tenantB);

    // Movimientos A (contrapartida = Caja, ACTIVO): Ventas 100k cr, Costo 60k db,
    // Sueldos 20k db → resultado = 100k − 80k = +20k utilidad.
    await crearMovimiento(tenantA, periodoPrevioAId, cajaAId, ventasAId, 100000); // debe Caja / haber Ventas
    await crearMovimiento(tenantA, periodoPrevioAId, costoAId, cajaAId, 60000); // debe Costo / haber Caja
    await crearMovimiento(tenantA, periodoPrevioAId, sueldosAId, cajaAId, 20000); // debe Sueldos / haber Caja
  }

  // ============================================================
  // Tests
  // ============================================================

  describe('generación con utilidad', () => {
    it('genera los 3 comprobantes de cierre en BORRADOR con generadoPorSistema=true', async () => {
      const res = await service.generarCierre(gestionAId, tenantA, 'user-a');

      expect(res.cierres).toHaveLength(3);
      const comprobantes = await prisma.comprobante.findMany({
        where: { organizationId: tenantA, tipo: TipoComprobante.CIERRE },
        include: { lineas: true },
      });
      expect(comprobantes).toHaveLength(3);
      for (const c of comprobantes) {
        expect(c.generadoPorSistema).toBe(true);
        expect(c.estado).toBe(EstadoComprobante.BORRADOR);
        expect(c.origenId).toBe(gestionAId);
        // fecha = último día del mesCierre (diciembre 2026).
        expect(c.fechaContable.toISOString().slice(0, 10)).toBe('2026-12-31');
        expect(c.periodoFiscalId).toBe(mesCierreAId);
        // partida doble del comprobante (ΣdebitoBob === ΣcreditoBob).
        const debe = c.lineas.reduce((a, l) => a + Number(l.debitoBob), 0);
        const haber = c.lineas.reduce((a, l) => a + Number(l.creditoBob), 0);
        expect(Math.abs(debe - haber)).toBeLessThan(0.01);
      }

      const slots = comprobantes.map((c) => c.origenTipo).sort();
      expect(slots).toEqual(['CIERRE_GASTOS', 'CIERRE_INGRESOS', 'CIERRE_RESULTADO']);
    });

    it('el traslado #3 lleva 20000 a RESULTADOS ACUMULADOS al HABER (utilidad)', async () => {
      await service.generarCierre(gestionAId, tenantA, 'user-a');
      const traslado = await prisma.comprobante.findFirst({
        where: { organizationId: tenantA, origenTipo: 'CIERRE_RESULTADO' },
        include: { lineas: true },
      });
      const lineaRA = traslado!.lineas.find((l) => l.cuentaId === acumuladosAId)!;
      expect(Number(lineaRA.creditoBob)).toBeCloseTo(20000, 2);
      expect(Number(lineaRA.debitoBob)).toBeCloseTo(0, 2);
    });
  });

  describe('idempotencia (REQ-CE-09)', () => {
    it('regenerar con borradores existentes borra y recrea sin duplicar', async () => {
      await service.generarCierre(gestionAId, tenantA, 'user-a');
      const primeros = await prisma.comprobante.findMany({
        where: { organizationId: tenantA, tipo: TipoComprobante.CIERRE },
        select: { id: true },
      });

      await service.generarCierre(gestionAId, tenantA, 'user-a');
      const segundos = await prisma.comprobante.findMany({
        where: { organizationId: tenantA, tipo: TipoComprobante.CIERRE },
        select: { id: true },
      });

      expect(segundos).toHaveLength(3);
      // Los ids cambiaron (borrado + recreado), no se acumularon.
      const idsViejos = new Set(primeros.map((c) => c.id));
      for (const c of segundos) {
        expect(idsViejos.has(c.id)).toBe(false);
      }
    });

    it('con un cierre CONTABILIZADO rechaza con CierreYaParcialmenteContabilizadoError', async () => {
      await service.generarCierre(gestionAId, tenantA, 'user-a');
      // Contabilizar uno de los cierres a mano.
      const uno = await prisma.comprobante.findFirst({
        where: { organizationId: tenantA, tipo: TipoComprobante.CIERRE },
      });
      await prisma.comprobante.update({
        where: { id: uno!.id },
        data: { estado: EstadoComprobante.CONTABILIZADO, numero: 'C2612-000001' },
      });

      await expect(service.generarCierre(gestionAId, tenantA, 'user-a')).rejects.toBeInstanceOf(
        CierreYaParcialmenteContabilizadoError,
      );
      // No borró nada: sigue habiendo 3.
      const count = await prisma.comprobante.count({
        where: { organizationId: tenantA, tipo: TipoComprobante.CIERRE },
      });
      expect(count).toBe(3);
    });
  });

  describe('aislamiento multi-tenant (REQ-CE-12)', () => {
    it('tenant B no puede generar el cierre de la gestión de A → NoEncontrada', async () => {
      await expect(service.generarCierre(gestionAId, tenantB, 'user-b')).rejects.toBeInstanceOf(
        CierreGestionNoEncontradaError,
      );
      const count = await prisma.comprobante.count({
        where: { organizationId: tenantA, tipo: TipoComprobante.CIERRE },
      });
      expect(count).toBe(0);
    });

    it('los comprobantes creados son solo del tenant A', async () => {
      await service.generarCierre(gestionAId, tenantA, 'user-a');
      const enB = await prisma.comprobante.count({
        where: { organizationId: tenantB, tipo: TipoComprobante.CIERRE },
      });
      expect(enB).toBe(0);
    });
  });

  describe('gates', () => {
    it('gestión inexistente → CierreGestionNoEncontradaError', async () => {
      await expect(service.generarCierre('no-existe', tenantA, 'user-a')).rejects.toBeInstanceOf(
        CierreGestionNoEncontradaError,
      );
    });

    it('gestión CERRADA → CierreGestionCerradaError', async () => {
      await prisma.gestionFiscal.update({
        where: { id: gestionAId },
        data: { status: GestionFiscalStatus.CERRADA },
      });
      await expect(service.generarCierre(gestionAId, tenantA, 'user-a')).rejects.toBeInstanceOf(
        CierreGestionCerradaError,
      );
    });

    it('mesCierre CERRADO → CierrePeriodoNoListoError', async () => {
      await prisma.periodoFiscal.update({
        where: { id: mesCierreAId },
        data: { status: PeriodoFiscalStatus.CERRADO },
      });
      await expect(service.generarCierre(gestionAId, tenantA, 'user-a')).rejects.toBeInstanceOf(
        CierrePeriodoNoListoError,
      );
    });

    it('período previo ABIERTO → CierrePeriodoNoListoError', async () => {
      await prisma.periodoFiscal.update({
        where: { id: periodoPrevioAId },
        data: { status: PeriodoFiscalStatus.ABIERTO },
      });
      await expect(service.generarCierre(gestionAId, tenantA, 'user-a')).rejects.toBeInstanceOf(
        CierrePeriodoNoListoError,
      );
    });

    it('gestión sin movimiento de resultado → CierreSinResultadoError', async () => {
      // gestión B no tiene movimientos.
      await expect(service.generarCierre(gestionBId, tenantB, 'user-b')).rejects.toBeInstanceOf(
        CierreSinResultadoError,
      );
    });
  });

  describe('caso pérdida', () => {
    it('genera 3 cierres y traslada |R| a RA al DEBE', async () => {
      // Reconfigurar A para pérdida: borrar movimientos y crear Ventas 50k / Costo 70k.
      await prisma.lineaComprobante.deleteMany({ where: { organizationId: tenantA } });
      await prisma.comprobante.deleteMany({
        where: { organizationId: tenantA, tipo: TipoComprobante.DIARIO },
      });
      await crearMovimiento(tenantA, periodoPrevioAId, cajaAId, ventasAId, 50000); // Ventas 50k cr
      await crearMovimiento(tenantA, periodoPrevioAId, costoAId, cajaAId, 70000); // Costo 70k db

      await service.generarCierre(gestionAId, tenantA, 'user-a');
      const traslado = await prisma.comprobante.findFirst({
        where: { organizationId: tenantA, origenTipo: 'CIERRE_RESULTADO' },
        include: { lineas: true },
      });
      const lineaRA = traslado!.lineas.find((l) => l.cuentaId === acumuladosAId)!;
      // Ventas 50k − (Costo 50k+20k) = −20k pérdida → RA al DEBE.
      expect(Number(lineaRA.debitoBob)).toBeCloseTo(20000, 2);
      expect(Number(lineaRA.creditoBob)).toBeCloseTo(0, 2);
    });
  });
});
