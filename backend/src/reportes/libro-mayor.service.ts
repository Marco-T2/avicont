import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NaturalezaCuenta } from '@prisma/client';

import { Money } from '@/common/domain/money';
import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FiltroRequeridoError,
  MovimientosExcedenLimiteError,
  PeriodoNoEncontradoError,
  RangoInvalidoError,
} from './domain/libro-mayor-errors';
import { calcularSaldoNeto } from './domain/saldo-naturaleza';
import type {
  CuentaMayorCalculada,
  LibroMayorResponseDto,
  MovimientoCalculado,
} from './dto/libro-mayor-response.dto';
import { toLibroMayorResponse } from './dto/libro-mayor-response.dto';
import {
  LIBRO_MAYOR_READER_PORT,
  LibroMayorReaderPort,
  MovimientoMayorRow,
  SaldoInicialRow,
} from './ports/libro-mayor-reader.port';

/** Nombre de la variable de entorno para el tope de movimientos (REQ-LM-12). */
export const LIBRO_MAYOR_MAX_MOVIMIENTOS_ENV = 'LIBRO_MAYOR_MAX_MOVIMIENTOS';

/**
 * Tope defensivo por defecto cuando la env no está configurada.
 * 20.000 líneas (no asientos): el Mayor opera por línea de cuenta;
 * ~2-4 líneas por asiento equivale a ~5.000-10.000 asientos.
 */
export const LIBRO_MAYOR_MAX_MOVIMIENTOS_DEFAULT = 20_000;

@Injectable()
export class LibroMayorService {
  private readonly maxMovimientos: number;

  constructor(
    @Inject(LIBRO_MAYOR_READER_PORT)
    private readonly mayorReader: LibroMayorReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
    private readonly config: ConfigService,
  ) {
    // REQ-LM-12: umbral configurable via env LIBRO_MAYOR_MAX_MOVIMIENTOS (default 20000).
    this.maxMovimientos = this.config.get<number>(
      LIBRO_MAYOR_MAX_MOVIMIENTOS_ENV,
      LIBRO_MAYOR_MAX_MOVIMIENTOS_DEFAULT,
    );
  }

  /**
   * Consulta el Libro Mayor para el tenant activo.
   *
   * Orquesta:
   *  1. Validación de filtros (DomainError si inválido)
   *  2. Resolución período → rango de fechas (si periodoFiscalId)
   *  3. Validación de cuenta (si cuentaId) → null→404, agrupadora→400
   *  4. Tope defensivo por count previo (REQ-LM-12)
   *  5. Consulta de movimientos + saldos iniciales (en paralelo)
   *  6. Agrupación, cálculo de running balance y serialización
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param query    - Parámetros de la query
   */
  async consultarLibroMayor(
    tenantId: string,
    query: {
      cuentaId?: string;
      periodoFiscalId?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      incluirAnulados: boolean;
      soloConMovimiento: boolean;
    },
  ): Promise<LibroMayorResponseDto> {
    // ── 1. Validación XOR filtro de forma ────────────────────────────────
    const tienePeriodo = query.periodoFiscalId !== undefined && query.periodoFiscalId !== '';
    const tieneDesde = query.fechaDesde !== undefined && query.fechaDesde !== '';
    const tieneHasta = query.fechaHasta !== undefined && query.fechaHasta !== '';
    const tieneRango = tieneDesde && tieneHasta;
    const tieneRangoParcial = (tieneDesde && !tieneHasta) || (!tieneDesde && tieneHasta);

    // REQ-LM-01: exactamente uno de período O rango
    if (tienePeriodo && tieneRango) throw new FiltroRequeridoError();
    if (tienePeriodo && tieneRangoParcial) throw new FiltroRequeridoError();
    if (!tienePeriodo && !tieneRango) throw new FiltroRequeridoError();

    // ── 2. Resolución rango de fechas ─────────────────────────────────────
    let fechaDesde: Date;
    let fechaHasta: Date;

    if (tienePeriodo) {
      const rangoResu = await this.periodosReader.obtenerRangoFechas(
        tenantId,
        query.periodoFiscalId!,
      );
      if (!rangoResu) {
        throw new PeriodoNoEncontradoError(query.periodoFiscalId!);
      }
      fechaDesde = rangoResu.desde;
      fechaHasta = rangoResu.hasta;
    } else {
      fechaDesde = parseFechaContable(query.fechaDesde!);
      fechaHasta = parseFechaContable(query.fechaHasta!);

      // REQ-LM-01: fechaDesde ≤ fechaHasta
      if (fechaDesde > fechaHasta) {
        throw new RangoInvalidoError(query.fechaDesde!, query.fechaHasta!);
      }
    }

    const filtros = {
      ...(query.cuentaId !== undefined ? { cuentaId: query.cuentaId } : {}),
      fechaDesde,
      fechaHasta,
      incluirAnulados: query.incluirAnulados,
    };

    // ── 3. Validación de cuenta (REQ-LM-07) ──────────────────────────────
    if (query.cuentaId !== undefined) {
      const cuentaDetalle = await this.mayorReader.obtenerCuentaDetalle(tenantId, query.cuentaId);
      if (!cuentaDetalle) {
        throw new CuentaNoEncontradaError(query.cuentaId);
      }
      if (!cuentaDetalle.esDetalle) {
        throw new CuentaNoDetalleError(query.cuentaId);
      }
    }

    // ── 4. Tope defensivo (REQ-LM-12) ────────────────────────────────────
    const cantidad = await this.mayorReader.contarMovimientos(tenantId, filtros);
    if (cantidad > this.maxMovimientos) {
      throw new MovimientosExcedenLimiteError(cantidad, this.maxMovimientos);
    }

    // ── 5. Consulta en paralelo (sin dependencia entre sí) ────────────────
    const [movimientoRows, saldoInicialRows] = await Promise.all([
      this.mayorReader.obtenerMovimientos(tenantId, filtros),
      this.mayorReader.obtenerSaldosIniciales(tenantId, filtros),
    ]);

    // ── 6. Agrupación y cálculo ───────────────────────────────────────────
    const cuentasCalculadas = this.calcularCuentas(
      movimientoRows,
      saldoInicialRows,
      query.soloConMovimiento,
    );

    return toLibroMayorResponse(cuentasCalculadas, { desde: fechaDesde, hasta: fechaHasta });
  }

  /**
   * Agrupa movimientos por cuentaId, aplica saldos iniciales y calcula running balance.
   * Retorna cuentas ordenadas por codigoInterno ASC (REQ-LM-08).
   */
  private calcularCuentas(
    movimientoRows: MovimientoMayorRow[],
    saldoInicialRows: SaldoInicialRow[],
    soloConMovimiento: boolean,
  ): CuentaMayorCalculada[] {
    // Índice de saldos iniciales por cuentaId
    const saldosMap = new Map<string, SaldoInicialRow>(
      saldoInicialRows.map((s) => [s.cuentaId, s]),
    );

    // Agrupar movimientos por cuentaId (preserva el orden del adapter — determinístico)
    const movimientosMap = new Map<string, MovimientoMayorRow[]>();
    for (const row of movimientoRows) {
      const lista = movimientosMap.get(row.cuentaId);
      if (lista) {
        lista.push(row);
      } else {
        movimientosMap.set(row.cuentaId, [row]);
      }
    }

    // Determinar set de cuentas a incluir
    const cuentasIds = new Set<string>([
      ...movimientosMap.keys(),
      // soloConMovimiento=false: incluir cuentas con saldo inicial != 0
      ...(soloConMovimiento
        ? []
        : [...saldosMap.keys()].filter((id) => {
            const s = saldosMap.get(id)!;
            return !calcularSaldoNeto(s.totalDebitoBob, s.totalCreditoBob, s.naturaleza).isZero();
          })),
    ]);

    // Para obtener metadata de cuenta de IDs solo presentes en saldosMap:
    // tomar la primera fila de movimientos o la fila de saldo
    const cuentasMeta = new Map<
      string,
      { codigoInterno: string; nombreCuenta: string; naturaleza: NaturalezaCuenta }
    >();
    for (const row of movimientoRows) {
      if (!cuentasMeta.has(row.cuentaId)) {
        cuentasMeta.set(row.cuentaId, {
          codigoInterno: row.codigoInterno,
          nombreCuenta: row.nombreCuenta,
          naturaleza: row.naturaleza,
        });
      }
    }
    for (const row of saldoInicialRows) {
      if (!cuentasMeta.has(row.cuentaId)) {
        cuentasMeta.set(row.cuentaId, {
          codigoInterno: row.codigoInterno,
          nombreCuenta: row.nombreCuenta,
          naturaleza: row.naturaleza,
        });
      }
    }

    const cuentasCalculadas: CuentaMayorCalculada[] = [];

    for (const cuentaId of cuentasIds) {
      const meta = cuentasMeta.get(cuentaId);
      if (!meta) continue;

      const saldoRow = saldosMap.get(cuentaId);
      const saldoInicial = saldoRow
        ? calcularSaldoNeto(saldoRow.totalDebitoBob, saldoRow.totalCreditoBob, saldoRow.naturaleza)
        : Money.ZERO;

      const movRows = movimientosMap.get(cuentaId) ?? [];

      const { movimientosCalculados, saldoFinal, totalDebeBob, totalHaberBob } =
        this.calcularRunningBalance(movRows, saldoInicial, meta.naturaleza);

      cuentasCalculadas.push({
        cuentaId,
        codigoInterno: meta.codigoInterno,
        nombreCuenta: meta.nombreCuenta,
        naturaleza: meta.naturaleza,
        saldoInicial,
        saldoFinal,
        totalDebeBob,
        totalHaberBob,
        movimientos: movimientosCalculados,
      });
    }

    // Ordenar por codigoInterno ASC (REQ-LM-08)
    cuentasCalculadas.sort((a, b) => a.codigoInterno.localeCompare(b.codigoInterno));

    return cuentasCalculadas;
  }

  /**
   * Calcula running balance para una cuenta.
   *
   * Signo por naturaleza (diseño §Decisión 3):
   *   - DEUDORA: saldo += debe − haber (activos/egresos aumentan con débito)
   *   - ACREEDORA: saldo += haber − debe (pasivos/patrimonio/ingresos aumentan con crédito)
   *
   * Código Tributario art. 47 + plan de cuentas analítico boliviano:
   * la naturaleza determina qué lado aumenta el saldo de la cuenta.
   */
  private calcularRunningBalance(
    rows: MovimientoMayorRow[],
    saldoInicial: Money,
    naturaleza: NaturalezaCuenta,
  ): {
    movimientosCalculados: MovimientoCalculado[];
    saldoFinal: Money;
    totalDebeBob: Money;
    totalHaberBob: Money;
  } {
    let saldoCorriente = saldoInicial;
    let totalDebeBob = Money.ZERO;
    let totalHaberBob = Money.ZERO;

    const movimientosCalculados: MovimientoCalculado[] = rows.map((row) => {
      const debe = Money.of(row.debitoBob);
      const haber = Money.of(row.creditoBob);

      totalDebeBob = totalDebeBob.plus(debe);
      totalHaberBob = totalHaberBob.plus(haber);

      // Aplicar signo por naturaleza (Código Tributario art. 47)
      if (naturaleza === NaturalezaCuenta.DEUDORA) {
        // DEUDORA: aumenta con DEBE, disminuye con HABER
        saldoCorriente = saldoCorriente.plus(debe).minus(haber);
      } else {
        // ACREEDORA: aumenta con HABER, disminuye con DEBE
        saldoCorriente = saldoCorriente.plus(haber).minus(debe);
      }

      return {
        comprobanteId: row.comprobanteId,
        numeroComprobante: row.numeroComprobante,
        fechaContable: row.fechaContable,
        glosa: row.glosa,
        glosaLinea: row.glosaLinea,
        estado: row.estado,
        anulado: row.anulado,
        orden: row.orden,
        debeBob: debe.toBob(),
        haberBob: haber.toBob(),
        saldoCorrienteBob: saldoCorriente.toBob(),
      };
    });

    return {
      movimientosCalculados,
      saldoFinal: saldoCorriente,
      totalDebeBob,
      totalHaberBob,
    };
  }
}

/**
 * Parsea "YYYY-MM-DD" a Date UTC (§4.6 CLAUDE.md — FechaContable calendario puro).
 * No usa `new Date(string)` directamente — el parse de ISO sin hora es implementation-defined.
 * Construimos explícitamente en UTC.
 *
 * PROHIBIDO en domain/service: `new Date()` para fecha hoy (§4.6); este helper
 * parsea fechas provistas por el cliente, no genera "hoy".
 */
function parseFechaContable(fecha: string): Date {
  const [yearStr, monthStr, dayStr] = fecha.split('-');
  const year = parseInt(yearStr ?? '0', 10);
  const month = parseInt(monthStr ?? '0', 10) - 1; // 0-indexed
  const day = parseInt(dayStr ?? '0', 10);
  return new Date(Date.UTC(year, month, day));
}
