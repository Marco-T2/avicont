/**
 * DTO de respuesta del Balance de Comprobación de Sumas y Saldos.
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 *
 * Tipos internos del builder (*Calculada con Money) separados de los DTO (string),
 * igual que el Estado de Resultados. El mapper serializa Money → string con
 * `toBob()` y Date → "YYYY-MM-DD".
 *
 * A diferencia del Balance General / Estado de Resultados, el Balance de
 * Comprobación es una LISTA PLANA de cuentas de detalle (DR-2 del design),
 * sin árbol jerárquico ni subtotales por agrupador.
 */

import { ApiProperty } from '@nestjs/swagger';

import type { NaturalezaCuenta } from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

import { formatFechaContable } from '../fecha-contable';

// ============================================================
// Tipos internos (Money — antes de serializar)
// ============================================================

/** Línea del Balance de Comprobación ya calculada con Money (una cuenta de detalle). */
export interface LineaBalanceComprobacionCalculada {
  cuentaId: string;
  codigoInterno: string;
  nombre: string;
  naturaleza: NaturalezaCuenta;
  sumasDebito: Money;
  sumasCredito: Money;
  saldoDeudor: Money;
  saldoAcreedor: Money;
}

/** Cuenta con saldo del lado opuesto a su naturaleza (señal de calidad, REQ-BC-07). */
export interface CuentaNaturalezaOpuestaCalculada {
  cuentaId: string;
  codigoInterno: string;
  nombre: string;
  naturaleza: NaturalezaCuenta;
  /** El saldo del lado contrario a la naturaleza de la cuenta. */
  saldoOpuesto: Money;
}

/** Resultado del builder `balance-comprobacion.ts`. */
export interface BalanceComprobacionResult {
  lineas: LineaBalanceComprobacionCalculada[];
  totalSumasDebito: Money;
  totalSumasCredito: Money;
  totalSaldoDeudor: Money;
  totalSaldoAcreedor: Money;
  /** Código Tributario art. 47 / §4.1: cuadre de sumas Y de saldos, tolerancia ±Bs 0.01. */
  cuadra: boolean;
  diferenciaSumas: Money;
  diferenciaSaldos: Money;
  cuentasNaturalezaOpuesta: CuentaNaturalezaOpuestaCalculada[];
}

// ============================================================
// Tipos del DTO de respuesta (string — serializados)
// ============================================================

export class LineaBalanceComprobacionDto {
  @ApiProperty() cuentaId!: string;
  @ApiProperty() codigoInterno!: string;
  @ApiProperty() nombre!: string;
  /** "DEUDORA" | "ACREEDORA" */
  @ApiProperty({ example: 'DEUDORA' }) naturaleza!: string;
  /** Σ débitos BOB del rango como string decimal (§4.5 CLAUDE.md). */
  @ApiProperty({ example: '1000.00' }) sumasDebito!: string;
  /** Σ créditos BOB del rango como string decimal (§4.5 CLAUDE.md). */
  @ApiProperty({ example: '300.00' }) sumasCredito!: string;
  /** MAX(sumasDebito − sumasCredito, 0) como string decimal. */
  @ApiProperty({ example: '700.00' }) saldoDeudor!: string;
  /** MAX(sumasCredito − sumasDebito, 0) como string decimal. */
  @ApiProperty({ example: '0.00' }) saldoAcreedor!: string;
}

export class CuentaNaturalezaOpuestaDto {
  @ApiProperty() cuentaId!: string;
  @ApiProperty() codigoInterno!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ example: 'DEUDORA' }) naturaleza!: string;
  /** Saldo del lado contrario a la naturaleza de la cuenta, string decimal. */
  @ApiProperty({ example: '150.00' }) saldoOpuesto!: string;
}

export class BalanceComprobacionResponseDto {
  /** Inicio del rango. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-04-01' }) fechaDesde!: string;
  /** Fin del rango. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-04-30' }) fechaHasta!: string;
  @ApiProperty({ type: () => [LineaBalanceComprobacionDto] })
  lineas!: LineaBalanceComprobacionDto[];
  /** Σ columna sumasDebito sobre las líneas incluidas, string decimal. */
  @ApiProperty({ example: '1000.00' }) totalSumasDebito!: string;
  @ApiProperty({ example: '1000.00' }) totalSumasCredito!: string;
  @ApiProperty({ example: '700.00' }) totalSaldoDeudor!: string;
  @ApiProperty({ example: '700.00' }) totalSaldoAcreedor!: string;
  /** §4.1: true si sumas Y saldos cuadran (tolerancia ±Bs 0.01). */
  @ApiProperty() cuadra!: boolean;
  /** totalSumasDebito − totalSumasCredito; puede ser negativo. String decimal. */
  @ApiProperty({ example: '0.00' }) diferenciaSumas!: string;
  /** totalSaldoDeudor − totalSaldoAcreedor; puede ser negativo. String decimal. */
  @ApiProperty({ example: '0.00' }) diferenciaSaldos!: string;
  @ApiProperty({ type: () => [CuentaNaturalezaOpuestaDto] })
  cuentasNaturalezaOpuesta!: CuentaNaturalezaOpuestaDto[];
}

// ============================================================
// Mapper: BalanceComprobacionResult → BalanceComprobacionResponseDto
// ============================================================

/**
 * Mapea el resultado calculado al DTO de respuesta del Balance de Comprobación.
 * Serializa Money → string con `toBob()` (2 decimales, §4.5) y Date →
 * "YYYY-MM-DD" (§4.6).
 *
 * @param result - Resultado calculado por balance-comprobacion.ts
 * @param rango  - Rango de fechas consultado
 */
export function toBalanceComprobacionResponse(
  result: BalanceComprobacionResult,
  rango: { desde: Date; hasta: Date },
): BalanceComprobacionResponseDto {
  return {
    fechaDesde: formatFechaContable(rango.desde),
    fechaHasta: formatFechaContable(rango.hasta),
    lineas: result.lineas.map((l) => ({
      cuentaId: l.cuentaId,
      codigoInterno: l.codigoInterno,
      nombre: l.nombre,
      naturaleza: l.naturaleza,
      sumasDebito: l.sumasDebito.toBob(),
      sumasCredito: l.sumasCredito.toBob(),
      saldoDeudor: l.saldoDeudor.toBob(),
      saldoAcreedor: l.saldoAcreedor.toBob(),
    })),
    totalSumasDebito: result.totalSumasDebito.toBob(),
    totalSumasCredito: result.totalSumasCredito.toBob(),
    totalSaldoDeudor: result.totalSaldoDeudor.toBob(),
    totalSaldoAcreedor: result.totalSaldoAcreedor.toBob(),
    cuadra: result.cuadra,
    diferenciaSumas: result.diferenciaSumas.toBob(),
    diferenciaSaldos: result.diferenciaSaldos.toBob(),
    cuentasNaturalezaOpuesta: result.cuentasNaturalezaOpuesta.map((c) => ({
      cuentaId: c.cuentaId,
      codigoInterno: c.codigoInterno,
      nombre: c.nombre,
      naturaleza: c.naturaleza,
      saldoOpuesto: c.saldoOpuesto.toBob(),
    })),
  };
}
