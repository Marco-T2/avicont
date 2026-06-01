/**
 * DTO de respuesta del Libro Mayor (REQ-LM-10).
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 *
 * `generadoEn` OMITIDO del MVP: el Diario no lo tiene y `new Date()` está prohibido
 * en service/domain (§4.6). Si se necesita en frontend, se agrega ahí.
 */

import { NaturalezaCuenta } from '@/common/domain/enums';
import { Money } from '@/common/domain/money';

import { formatFechaContable } from '../fecha-contable';

// ============================================================
// Tipos del DTO de respuesta
// ============================================================

export interface MovimientoMayorDto {
  comprobanteId: string;
  /** Número correlativo del comprobante. Null solo en BORRADOR — el Mayor nunca muestra BORRADOR. */
  numeroComprobante: string | null;
  /** Fecha contable calendario puro: "YYYY-MM-DD" (§4.6). */
  fechaContable: string;
  /** Glosa del comprobante cabecera. */
  glosa: string;
  /** Glosa de la línea (nullable). */
  glosaLinea: string | null;
  estado: string;
  /** Flag de anulación ortogonal al estado (§4.7 CLAUDE.md). */
  anulado: boolean;
  orden: number;
  /** Monto debe en BOB como string decimal. "0.00" si es haber. (§4.5) */
  debeBob: string;
  /** Monto haber en BOB como string decimal. "0.00" si es debe. (§4.5) */
  haberBob: string;
  /** Saldo corriente acumulado después de este movimiento. String decimal (§4.5). */
  saldoCorrienteBob: string;
}

export interface CuentaMayorDto {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  /** Naturaleza contable: DEUDORA (activos/egresos) o ACREEDORA (pasivos/patrimonio/ingresos). */
  naturaleza: string;
  /** Saldo antes del primer movimiento del rango. String decimal, puede ser negativo. (§4.5) */
  saldoInicialBob: string;
  /** Saldo al final del rango (= saldoCorriente del último movimiento). String decimal. (§4.5) */
  saldoFinalBob: string;
  /** Suma de debitoBob de los movimientos del rango. */
  totalDebeBob: string;
  /** Suma de creditoBob de los movimientos del rango. */
  totalHaberBob: string;
  movimientos: MovimientoMayorDto[];
}

export interface LibroMayorResponseDto {
  rango: {
    fechaDesde: string;
    fechaHasta: string;
  };
  /** Cuentas con movimientos (y/o saldo previo si soloConMovimiento=false), ordenadas por codigoInterno ASC. */
  cuentas: CuentaMayorDto[];
  /** Suma de todos los debitoBob del rango, de todas las cuentas. */
  totalDebeBob: string;
  /** Suma de todos los creditoBob del rango, de todas las cuentas. */
  totalHaberBob: string;
}

// ============================================================
// Tipo interno del service — cuentas ya calculadas con Money
// ============================================================

/** Movimiento ya calculado (saldoCorriente resuelto por el service). */
export interface MovimientoCalculado {
  comprobanteId: string;
  numeroComprobante: string | null;
  fechaContable: Date;
  glosa: string;
  glosaLinea: string | null;
  estado: string;
  anulado: boolean;
  orden: number;
  debeBob: string;
  haberBob: string;
  saldoCorrienteBob: string;
}

/** Cuenta con saldos y running balance ya calculados por el service. */
export interface CuentaMayorCalculada {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  naturaleza: NaturalezaCuenta;
  saldoInicial: Money;
  saldoFinal: Money;
  totalDebeBob: Money;
  totalHaberBob: Money;
  movimientos: MovimientoCalculado[];
}

// ============================================================
// Helpers de serialización
// ============================================================

// ============================================================
// Mapper: CuentaMayorCalculada[] → DTO de respuesta
// ============================================================

/**
 * Mapea cuentas ya calculadas (saldos aplicados por el service) al DTO de respuesta.
 * Serializa Money → string con toBob() y Date → "YYYY-MM-DD" con formatFechaContable.
 *
 * @param cuentas - Resultado del service (saldos y running balance ya calculados)
 * @param rango   - Rango resuelto { desde, hasta } (período o fechas directas)
 */
export function toLibroMayorResponse(
  cuentas: CuentaMayorCalculada[],
  rango: { desde: Date; hasta: Date },
): LibroMayorResponseDto {
  let totalDebeAcc = Money.ZERO;
  let totalHaberAcc = Money.ZERO;

  const cuentasDto: CuentaMayorDto[] = cuentas.map((c) => {
    totalDebeAcc = totalDebeAcc.plus(c.totalDebeBob);
    totalHaberAcc = totalHaberAcc.plus(c.totalHaberBob);

    const movimientosDto: MovimientoMayorDto[] = c.movimientos.map((m) => ({
      comprobanteId: m.comprobanteId,
      numeroComprobante: m.numeroComprobante,
      fechaContable: formatFechaContable(m.fechaContable),
      glosa: m.glosa,
      glosaLinea: m.glosaLinea,
      estado: m.estado,
      anulado: m.anulado,
      orden: m.orden,
      debeBob: m.debeBob,
      haberBob: m.haberBob,
      saldoCorrienteBob: m.saldoCorrienteBob,
    }));

    return {
      cuentaId: c.cuentaId,
      codigoInterno: c.codigoInterno,
      nombreCuenta: c.nombreCuenta,
      naturaleza: c.naturaleza,
      saldoInicialBob: c.saldoInicial.toBob(),
      saldoFinalBob: c.saldoFinal.toBob(),
      totalDebeBob: c.totalDebeBob.toBob(),
      totalHaberBob: c.totalHaberBob.toBob(),
      movimientos: movimientosDto,
    };
  });

  return {
    rango: {
      fechaDesde: formatFechaContable(rango.desde),
      fechaHasta: formatFechaContable(rango.hasta),
    },
    cuentas: cuentasDto,
    totalDebeBob: totalDebeAcc.toBob(),
    totalHaberBob: totalHaberAcc.toBob(),
  };
}
