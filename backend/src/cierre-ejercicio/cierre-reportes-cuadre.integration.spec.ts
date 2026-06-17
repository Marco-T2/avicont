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

import { Money } from '@/common/domain/money';
import type { PrismaService } from '@/common/prisma.service';
import { PrismaCierreComprobanteWriterAdapter } from '@/comprobantes/adapters/prisma-cierre-comprobante-writer.adapter';
import { PrismaPeriodosReaderAdapter } from '@/periodos-fiscales/adapters/prisma-periodos-reader.adapter';
import { BalanceComprobacionService } from '@/reportes/balance-comprobacion.service';
import { BalanceGeneralService } from '@/reportes/balance-general.service';
import { EstadoResultadosService } from '@/reportes/estado-resultados.service';
import { EvolucionPatrimonioService } from '@/reportes/evolucion-patrimonio.service';
import { PrismaEeffSaldosReaderAdapter } from '@/reportes/adapters/prisma-eeff-saldos-reader.adapter';

import { EeffCierreSaldosAdapter } from './adapters/eeff-cierre-saldos.adapter';
import { PrismaCierreConfigReaderAdapter } from './adapters/prisma-cierre-config-reader.adapter';
import { PrismaCierreGestionReaderAdapter } from './adapters/prisma-cierre-gestion-reader.adapter';
import { CierreEjercicioService } from './cierre-ejercicio.service';

/**
 * Regresión de cuadre de reportes ante el cierre del ejercicio (REQ-CE-16, decisión C).
 *
 * Demuestra que postear los 3 asientos de cierre reales (tipo CIERRE) NO rompe los
 * reportes. La decisión C tiene una asimetría DELIBERADA del contrato `excluirCierre`:
 *   - ER / EFE / Balance-Comprobación / Hoja-Trabajo EXCLUYEN CIERRE (resultado operativo).
 *   - BG (`obtenerSaldosHasta`) y EEPN lo INCLUYEN (patrimonio acumulado real).
 *
 * Los 4 invariantes (caso UTILIDAD y caso PÉRDIDA), con aserción numérica ±Bs 0.01:
 *   1. ER / Balance-Comprobación de la gestión cerrada siguen mostrando `R` (excluyen CIERRE).
 *   2. BG a fecha mesCierre: `patrimonioTotal` idéntico antes/después; la línea sintética
 *      "Resultado del Ejercicio" pasa de `R` a ≈0; RESULTADOS ACUMULADOS sube/baja en |R|.
 *   3. RESULTADOS ACUMULADOS al inicio de la gestión siguiente = acumulado_previo + `R`,
 *      exactamente UNA vez (migró vía el asiento #3, no se duplicó).
 *   4. EEPN: el traslado #3 aparece como movimiento de patrimonio y `cuadra`.
 *
 * Aislamiento multi-tenant: el cierre de A no afecta los reportes de B.
 *
 * Si un invariante FALLA, NO es bug de este test: es señal de que la decisión C está
 * equivocada (un reporte double-cuenta o pierde el resultado). Es el hallazgo más
 * importante del change.
 */
describe('Cierre de ejercicio — regresión de cuadre de reportes (integration)', () => {
  const SLUG_A = 'org-cuadre-a';
  const SLUG_B = 'org-cuadre-b';
  const FECHA_MES_CIERRE = '2026-12-31';
  // Una fecha de la gestión SIGUIENTE (G+1), para leer RESULTADOS ACUMULADOS arrastrado.
  const FECHA_GESTION_SIGUIENTE = new Date(Date.UTC(2027, 0, 31));

  let prisma: PrismaClient;
  let cierreService: CierreEjercicioService;
  let eeffAdapter: PrismaEeffSaldosReaderAdapter;
  let erService: EstadoResultadosService;
  let bgService: BalanceGeneralService;
  let eepnService: EvolucionPatrimonioService;
  let bcService: BalanceComprobacionService;

  let tenantA: string;
  let tenantB: string;
  let gestionAId: string;
  let periodoPrevioAId: string; // período 1 de A (donde van los movimientos)

  // Cuentas de A
  let acumuladosAId: string; // 3.1.3.001 RESULTADOS ACUMULADOS

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    eeffAdapter = new PrismaEeffSaldosReaderAdapter(prisma as unknown as PrismaService);
    const periodosReader = new PrismaPeriodosReaderAdapter(prisma as unknown as PrismaService);

    cierreService = new CierreEjercicioService(
      new PrismaCierreGestionReaderAdapter(prisma as unknown as PrismaService),
      new PrismaCierreConfigReaderAdapter(prisma as unknown as PrismaService),
      new EeffCierreSaldosAdapter(eeffAdapter),
      new PrismaCierreComprobanteWriterAdapter(prisma as unknown as PrismaService),
      prisma as unknown as PrismaService,
    );

    erService = new EstadoResultadosService(eeffAdapter, periodosReader);
    bgService = new BalanceGeneralService(eeffAdapter, periodosReader);
    eepnService = new EvolucionPatrimonioService(eeffAdapter, periodosReader);
    bcService = new BalanceComprobacionService(eeffAdapter, periodosReader);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
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
   * Gestión 2026 con 12 períodos: 1-11 CERRADO, 12 (mesCierre) ABIERTO.
   */
  async function crearGestion(tenantId: string): Promise<{
    gestionId: string;
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
      if (mes === 1) periodo1Id = periodo.id;
    }
    return { gestionId: gestion.id, periodo1Id };
  }

  /** Comprobante DIARIO CONTABILIZADO de 2 líneas en BOB. */
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

  /**
   * Genera + contabiliza los 3 cierres de la gestión de A. Devuelve cuántos se
   * contabilizaron (≤3 por SKIP-on-zero). El número correlativo es irrelevante
   * para los reportes; se asigna uno sintético único.
   */
  async function generarYContabilizarCierre(tenantId: string, gestionId: string): Promise<number> {
    await cierreService.generarCierre(gestionId, tenantId, 'user-cierre');
    const cierres = await prisma.comprobante.findMany({
      where: { organizationId: tenantId, tipo: TipoComprobante.CIERRE },
      select: { id: true },
    });
    let n = 0;
    for (const c of cierres) {
      n += 1;
      await prisma.comprobante.update({
        where: { id: c.id },
        data: {
          estado: EstadoComprobante.CONTABILIZADO,
          numero: `C2612-${String(n).padStart(6, '0')}`,
        },
      });
    }
    return n;
  }

  // ── Snapshots de reportes ───────────────────────────────────────────────

  /** Resultado operativo del Estado de Resultados (excluye CIERRE). */
  async function resultadoER(tenantId: string, gestionId: string): Promise<Money> {
    const er = await erService.consultarEstadoResultados(tenantId, { gestionId });
    return Money.of(er.resultadoEjercicioBob);
  }

  /** Snapshot de patrimonio del Balance General a fecha mesCierre. */
  async function snapshotBG(tenantId: string, gestionId: string) {
    const bg = await bgService.consultarBalanceGeneral(tenantId, {
      fecha: FECHA_MES_CIERRE,
      gestionId,
      incluirAnulados: false,
    });
    // Línea sintética del resultado del ejercicio dentro de PATRIMONIO.
    const sintetica = bg.patrimonio.subsecciones
      .flatMap((s) => s.cuentas)
      .find((c) => c.esSintetica);
    return {
      patrimonioTotal: Money.of(bg.totalPatrimonioBob),
      resultadoSintetico: Money.of(sintetica?.saldoBob ?? '0'),
      resultadoEjercicio: Money.of(bg.resultadoEjercicioBob),
      cuadra: bg.cuadra,
    };
  }

  /**
   * Saldo neto (acreedor +, deudor −) de RESULTADOS ACUMULADOS a una fecha,
   * leído con `obtenerSaldosHasta` (INCLUYE CIERRE). RA es ACREEDORA → acreedor − deudor.
   */
  async function saldoResultadosAcumulados(tenantId: string, fechaCorte: Date): Promise<Money> {
    const rows = await eeffAdapter.obtenerSaldosHasta(tenantId, {
      fechaCorte,
      incluirAnulados: false,
    });
    const ra = rows.find((r) => r.cuentaId === acumuladosAId);
    if (!ra) return Money.ZERO;
    return Money.of(ra.totalCreditoBob.toString()).minus(Money.of(ra.totalDebitoBob.toString()));
  }

  /** Componente RA del EEPN (movimiento de patrimonio del período) + cuadre global. */
  async function snapshotEEPN(tenantId: string, gestionId: string) {
    const eepn = await eepnService.consultarEvolucionPatrimonio(tenantId, { gestionId });
    const compRA = eepn.componentes.find((c) => c.cuentaId === acumuladosAId);
    return {
      cuadra: eepn.cuadra,
      raOtrosMovimientos: Money.of(compRA?.otrosMovimientosBob ?? '0'),
      raSaldoFinal: Money.of(compRA?.saldoFinalBob ?? '0'),
    };
  }

  /** Diferencia de cuadre del Balance de Comprobación (excluye CIERRE). */
  async function balanceComprobacionCuadra(tenantId: string): Promise<boolean> {
    const bc = await bcService.consultarBalanceComprobacion(tenantId, {
      desde: '2026-01-01',
      hasta: '2026-12-31',
      incluirAnulados: false,
    });
    return bc.cuadra;
  }

  function esCercano(a: Money, b: Money): boolean {
    return a.minus(b).abs().lessThanOrEqualTo(Money.of('0.01'));
  }

  // ============================================================
  // CASO UTILIDAD: Ventas 100k, Costo 60k, Sueldos 20k → R = +20.000
  // ============================================================

  describe('caso UTILIDAD (R = +20.000)', () => {
    const R = Money.of('20000.00');

    beforeEach(async () => {
      await cleanup();
      const [orgA, orgB] = await Promise.all([
        prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Cuadre A' } }),
        prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Cuadre B' } }),
      ]);
      tenantA = orgA.id;
      tenantB = orgB.id;

      const ctas = await crearCuentasDeResultado(tenantA);
      acumuladosAId = ctas.acumulados;
      await crearCuentasDeResultado(tenantB);

      const gA = await crearGestion(tenantA);
      gestionAId = gA.gestionId;
      periodoPrevioAId = gA.periodo1Id;
      await crearGestion(tenantB);

      await crearMovimiento(tenantA, periodoPrevioAId, ctas.caja, ctas.ventas, 100000);
      await crearMovimiento(tenantA, periodoPrevioAId, ctas.costo, ctas.caja, 60000);
      await crearMovimiento(tenantA, periodoPrevioAId, ctas.sueldos, ctas.caja, 20000);
    });

    it('Invariante 1 — el ER de la gestión cerrada sigue mostrando R (excluye CIERRE)', async () => {
      const erAntes = await resultadoER(tenantA, gestionAId);
      expect(esCercano(erAntes, R)).toBe(true);

      await generarYContabilizarCierre(tenantA, gestionAId);

      const erDespues = await resultadoER(tenantA, gestionAId);
      expect(esCercano(erDespues, R)).toBe(true);
      // Idéntico antes y después: el cierre NO vacía el ER.
      expect(esCercano(erAntes, erDespues)).toBe(true);
    });

    it('Invariante 2 — el patrimonio del BG se conserva; el resultado migra a RA una vez', async () => {
      const bgAntes = await snapshotBG(tenantA, gestionAId);
      expect(bgAntes.cuadra).toBe(true);
      // Antes del cierre el resultado vive en la línea sintética.
      expect(esCercano(bgAntes.resultadoSintetico, R)).toBe(true);
      const raAntes = await saldoResultadosAcumulados(tenantA, new Date(Date.UTC(2026, 11, 31)));
      expect(esCercano(raAntes, Money.ZERO)).toBe(true);

      await generarYContabilizarCierre(tenantA, gestionAId);

      const bgDespues = await snapshotBG(tenantA, gestionAId);
      expect(bgDespues.cuadra).toBe(true);
      // El patrimonio total NO cambia (el resultado migró, no se duplicó).
      expect(esCercano(bgAntes.patrimonioTotal, bgDespues.patrimonioTotal)).toBe(true);
      // La línea sintética cae a ≈0 (los saldos INGRESO/EGRESO los anuló el cierre).
      expect(esCercano(bgDespues.resultadoSintetico, Money.ZERO)).toBe(true);
      // RESULTADOS ACUMULADOS subió exactamente R.
      const raDespues = await saldoResultadosAcumulados(tenantA, new Date(Date.UTC(2026, 11, 31)));
      expect(esCercano(raDespues.minus(raAntes), R)).toBe(true);
    });

    it('Invariante 3 — RESULTADOS ACUMULADOS en G+1 = previo + R, exactamente una vez', async () => {
      const raG1Antes = await saldoResultadosAcumulados(tenantA, FECHA_GESTION_SIGUIENTE);
      expect(esCercano(raG1Antes, Money.ZERO)).toBe(true);

      await generarYContabilizarCierre(tenantA, gestionAId);

      const raG1Despues = await saldoResultadosAcumulados(tenantA, FECHA_GESTION_SIGUIENTE);
      // = previo (0) + R, una sola vez. Si se duplicara daría +2R.
      expect(esCercano(raG1Despues, R)).toBe(true);
      expect(esCercano(raG1Despues, R.mul(2))).toBe(false);
    });

    it('Invariante 4 — EEPN cuadra y el traslado #3 mueve RA al patrimonio', async () => {
      await generarYContabilizarCierre(tenantA, gestionAId);

      const eepn = await snapshotEEPN(tenantA, gestionAId);
      expect(eepn.cuadra).toBe(true);
      // El traslado #3 acreditó RA en R (utilidad): aparece como movimiento del período.
      expect(esCercano(eepn.raOtrosMovimientos, R)).toBe(true);
      expect(esCercano(eepn.raSaldoFinal, R)).toBe(true);
    });

    it('Invariante 1 (bis) — el Balance de Comprobación sigue cuadrando tras el cierre', async () => {
      expect(await balanceComprobacionCuadra(tenantA)).toBe(true);
      await generarYContabilizarCierre(tenantA, gestionAId);
      expect(await balanceComprobacionCuadra(tenantA)).toBe(true);
    });

    it('aislamiento multi-tenant — el cierre de A no altera los reportes de B', async () => {
      // B no tiene movimientos: su ER da 0 y su BG cuadra, antes y después del cierre de A.
      const bgBAntes = await snapshotBG(tenantB, (await gestionDe(tenantB)).id);
      await generarYContabilizarCierre(tenantA, gestionAId);
      const bgBDespues = await snapshotBG(tenantB, (await gestionDe(tenantB)).id);
      expect(esCercano(bgBAntes.patrimonioTotal, bgBDespues.patrimonioTotal)).toBe(true);
      // B no tiene comprobantes CIERRE.
      const cierresB = await prisma.comprobante.count({
        where: { organizationId: tenantB, tipo: TipoComprobante.CIERRE },
      });
      expect(cierresB).toBe(0);
    });
  });

  // ============================================================
  // CASO PÉRDIDA: Ventas 50k, Costo 70k → R = −20.000
  // ============================================================

  describe('caso PÉRDIDA (R = −20.000)', () => {
    const R = Money.of('-20000.00');
    const ABS_R = Money.of('20000.00');

    beforeEach(async () => {
      await cleanup();
      const [orgA, orgB] = await Promise.all([
        prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Cuadre A' } }),
        prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Cuadre B' } }),
      ]);
      tenantA = orgA.id;
      tenantB = orgB.id;

      const ctas = await crearCuentasDeResultado(tenantA);
      acumuladosAId = ctas.acumulados;
      await crearCuentasDeResultado(tenantB);

      const gA = await crearGestion(tenantA);
      gestionAId = gA.gestionId;
      periodoPrevioAId = gA.periodo1Id;
      await crearGestion(tenantB);

      await crearMovimiento(tenantA, periodoPrevioAId, ctas.caja, ctas.ventas, 50000);
      await crearMovimiento(tenantA, periodoPrevioAId, ctas.costo, ctas.caja, 70000);
    });

    it('Invariante 1 — el ER de la gestión cerrada sigue mostrando la pérdida R', async () => {
      const erAntes = await resultadoER(tenantA, gestionAId);
      expect(esCercano(erAntes, R)).toBe(true);

      await generarYContabilizarCierre(tenantA, gestionAId);

      const erDespues = await resultadoER(tenantA, gestionAId);
      expect(esCercano(erDespues, R)).toBe(true);
      expect(esCercano(erAntes, erDespues)).toBe(true);
    });

    it('Invariante 2 — el patrimonio del BG se conserva; la pérdida reduce RA una vez', async () => {
      const bgAntes = await snapshotBG(tenantA, gestionAId);
      expect(bgAntes.cuadra).toBe(true);
      expect(esCercano(bgAntes.resultadoSintetico, R)).toBe(true);
      const raAntes = await saldoResultadosAcumulados(tenantA, new Date(Date.UTC(2026, 11, 31)));
      expect(esCercano(raAntes, Money.ZERO)).toBe(true);

      await generarYContabilizarCierre(tenantA, gestionAId);

      const bgDespues = await snapshotBG(tenantA, gestionAId);
      expect(bgDespues.cuadra).toBe(true);
      expect(esCercano(bgAntes.patrimonioTotal, bgDespues.patrimonioTotal)).toBe(true);
      expect(esCercano(bgDespues.resultadoSintetico, Money.ZERO)).toBe(true);
      // La pérdida REDUJO RA en |R| (saldo deudor): raDespues − raAntes = R (negativo).
      const raDespues = await saldoResultadosAcumulados(tenantA, new Date(Date.UTC(2026, 11, 31)));
      expect(esCercano(raDespues.minus(raAntes), R)).toBe(true);
    });

    it('Invariante 3 — RESULTADOS ACUMULADOS en G+1 = previo + R (pérdida), una vez', async () => {
      const raG1Antes = await saldoResultadosAcumulados(tenantA, FECHA_GESTION_SIGUIENTE);
      expect(esCercano(raG1Antes, Money.ZERO)).toBe(true);

      await generarYContabilizarCierre(tenantA, gestionAId);

      const raG1Despues = await saldoResultadosAcumulados(tenantA, FECHA_GESTION_SIGUIENTE);
      // RA negativa por la pérdida, una sola vez (no −2R).
      expect(esCercano(raG1Despues, R)).toBe(true);
      expect(esCercano(raG1Despues, R.mul(2))).toBe(false);
    });

    it('Invariante 4 — EEPN cuadra y el traslado #3 debita RA (pérdida)', async () => {
      await generarYContabilizarCierre(tenantA, gestionAId);

      const eepn = await snapshotEEPN(tenantA, gestionAId);
      expect(eepn.cuadra).toBe(true);
      // El traslado #3 debitó RA en |R|: aparece como movimiento NEGATIVO del período.
      expect(esCercano(eepn.raOtrosMovimientos, R)).toBe(true);
      expect(esCercano(eepn.raSaldoFinal, R)).toBe(true);
      expect(esCercano(eepn.raSaldoFinal.abs(), ABS_R)).toBe(true);
    });

    it('Invariante 1 (bis) — el Balance de Comprobación sigue cuadrando tras el cierre (pérdida)', async () => {
      expect(await balanceComprobacionCuadra(tenantA)).toBe(true);
      await generarYContabilizarCierre(tenantA, gestionAId);
      expect(await balanceComprobacionCuadra(tenantA)).toBe(true);
    });
  });

  /** Helper: gestión del tenant (única en estos tests). */
  async function gestionDe(tenantId: string): Promise<{ id: string }> {
    const g = await prisma.gestionFiscal.findFirstOrThrow({
      where: { organizationId: tenantId },
      select: { id: true },
    });
    return g;
  }
});
