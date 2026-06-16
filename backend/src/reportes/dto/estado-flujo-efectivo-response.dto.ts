/**
 * DTO de respuesta del Estado de Flujo de Efectivo (EFE) por método indirecto.
 *
 * 5º estado financiero formal del juego boliviano (NC N°11 / NIC 7 supletoria,
 * Resolución CTNAC 01/2012). Parte del resultado del ejercicio y lo concilia con
 * la variación neta de efectivo a través de las 3 actividades de la NIC 7
 * (operación, inversión, financiación). El efectivo es el ANCLA de la
 * conciliación, no una sección.
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Montos con signo: "+x" libera efectivo, "-x" lo consume. Fechas "YYYY-MM-DD"
 * (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 *
 * Tipos internos del builder (*Calculado con Money) separados de los DTO (string),
 * igual que el EEPN. El mapper serializa Money → string y Date → "YYYY-MM-DD".
 */

import { ApiProperty } from '@nestjs/swagger';

import { Money } from '@/common/domain/money';

import { formatFechaContable } from '../fecha-contable';

// ============================================================
// Tipos internos del builder (Money — antes de serializar)
// ============================================================

/** Naturaleza de una línea dentro de una sección del EFE. */
export type TipoLineaFlujo =
  | 'RESULTADO_EJERCICIO'
  | 'PARTIDA_NO_MONETARIA'
  | 'VARIACION_CAPITAL_TRABAJO'
  | 'VARIACION_CUENTA';

/** Una línea (renglón) dentro de una sección de actividad. */
export interface LineaFlujoCalculada {
  /** Null en la línea sintética "Resultado del ejercicio". */
  cuentaId: string | null;
  codigoInterno: string | null;
  nombre: string;
  tipo: TipoLineaFlujo;
  /** Flujo de caja con signo: positivo libera efectivo, negativo lo consume. */
  montoBob: Money;
}

/** Una sección de actividad (operación / inversión / financiación). */
export interface SeccionFlujoCalculada {
  lineas: LineaFlujoCalculada[];
  subtotalBob: Money;
}

/** Cuenta de efectivo identificada solo por heurística de código (señal de calidad). */
export interface CuentaEfectivoHeuristicaCalculada {
  cuentaId: string;
  codigoInterno: string;
  nombre: string;
}

/** Resultado del builder `estado-flujo-efectivo.ts` — ya con cuadre calculado. */
export interface EstadoFlujoEfectivoResult {
  resultadoEjercicioBob: Money;
  operacion: SeccionFlujoCalculada;
  inversion: SeccionFlujoCalculada;
  financiacion: SeccionFlujoCalculada;
  efectivoInicialBob: Money;
  variacionNetaBob: Money;
  efectivoFinalBob: Money;
  /** true si efectivoInicial + variacionNeta ≈ efectivoFinal (±Bs 0.01). */
  cuadra: boolean;
  /** (efectivoInicial + variacionNeta) − efectivoFinal. "0.00" si cuadra. */
  diferenciaBob: Money;
  advertencias: string[];
  cuentasEfectivoDetectadasPorHeuristica: CuentaEfectivoHeuristicaCalculada[];
}

// ============================================================
// Tipos del DTO de respuesta (string — serializados)
// ============================================================

export class LineaFlujoDto {
  @ApiProperty({ type: String, nullable: true }) cuentaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) codigoInterno!: string | null;
  @ApiProperty() nombre!: string;
  @ApiProperty({
    enum: [
      'RESULTADO_EJERCICIO',
      'PARTIDA_NO_MONETARIA',
      'VARIACION_CAPITAL_TRABAJO',
      'VARIACION_CUENTA',
    ],
  })
  tipo!: TipoLineaFlujo;
  /** Flujo de caja con signo (BOB string, §4.5): "+x" libera, "-x" consume. */
  @ApiProperty({ example: '-3000.00' }) monto!: string;
}

export class SeccionFlujoDto {
  @ApiProperty({ type: () => [LineaFlujoDto] }) lineas!: LineaFlujoDto[];
  @ApiProperty({ example: '5000.00' }) subtotal!: string;
}

export class CuentaEfectivoHeuristicaDto {
  @ApiProperty() cuentaId!: string;
  @ApiProperty() codigoInterno!: string;
  @ApiProperty() nombre!: string;
}

export class EstadoFlujoEfectivoResponseDto {
  /** Inicio del período evaluado. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-01-01' }) fechaDesde!: string;
  /** Fin del período evaluado. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-12-31' }) fechaHasta!: string;
  /** Resultado del ejercicio (punto de partida del método indirecto, BOB string). */
  @ApiProperty({ example: '5000.00' }) resultadoEjercicio!: string;
  @ApiProperty({ type: () => SeccionFlujoDto }) operacion!: SeccionFlujoDto;
  @ApiProperty({ type: () => SeccionFlujoDto }) inversion!: SeccionFlujoDto;
  @ApiProperty({ type: () => SeccionFlujoDto }) financiacion!: SeccionFlujoDto;
  /** Σ saldoNeto(inicial) de las cuentas de efectivo (BOB string). */
  @ApiProperty({ example: '5000.00' }) efectivoInicial!: string;
  /** subtotalOperacion + subtotalInversion + subtotalFinanciacion (BOB string). */
  @ApiProperty({ example: '45000.00' }) variacionNeta!: string;
  /** Σ saldoNeto(final) de las cuentas de efectivo (BOB string). */
  @ApiProperty({ example: '50000.00' }) efectivoFinal!: string;
  /**
   * true si la conciliación cuadra: efectivoInicial + variacionNeta ≈ efectivoFinal
   * (±Bs 0.01). HTTP 200 siempre — el descuadre es dato de control, no error.
   */
  @ApiProperty() cuadra!: boolean;
  @ApiProperty({ example: '0.00' }) diferencia!: string;
  /** Señales de calidad legibles (no afectan totales). */
  @ApiProperty({ type: [String], example: ['No se identificó ninguna cuenta de efectivo'] })
  advertencias!: string[];
  /** Cuentas de efectivo identificadas por heurística de código (no marcadas). */
  @ApiProperty({ type: () => [CuentaEfectivoHeuristicaDto] })
  cuentasEfectivoDetectadasPorHeuristica!: CuentaEfectivoHeuristicaDto[];
}

// ============================================================
// Mapper: EstadoFlujoEfectivoResult → EstadoFlujoEfectivoResponseDto
// ============================================================

function toSeccionDto(seccion: SeccionFlujoCalculada): SeccionFlujoDto {
  return {
    lineas: seccion.lineas.map((l) => ({
      cuentaId: l.cuentaId,
      codigoInterno: l.codigoInterno,
      nombre: l.nombre,
      tipo: l.tipo,
      monto: l.montoBob.toBob(),
    })),
    subtotal: seccion.subtotalBob.toBob(),
  };
}

/**
 * Mapea el resultado calculado del builder al DTO de respuesta.
 * Serializa Money → string con toBob() (signo preservado) y Date → "YYYY-MM-DD".
 */
export function toEstadoFlujoEfectivoResponse(
  result: EstadoFlujoEfectivoResult,
  contexto: { desde: Date; hasta: Date },
): EstadoFlujoEfectivoResponseDto {
  return {
    fechaDesde: formatFechaContable(contexto.desde),
    fechaHasta: formatFechaContable(contexto.hasta),
    resultadoEjercicio: result.resultadoEjercicioBob.toBob(),
    operacion: toSeccionDto(result.operacion),
    inversion: toSeccionDto(result.inversion),
    financiacion: toSeccionDto(result.financiacion),
    efectivoInicial: result.efectivoInicialBob.toBob(),
    variacionNeta: result.variacionNetaBob.toBob(),
    efectivoFinal: result.efectivoFinalBob.toBob(),
    cuadra: result.cuadra,
    diferencia: result.diferenciaBob.toBob(),
    advertencias: result.advertencias,
    cuentasEfectivoDetectadasPorHeuristica: result.cuentasEfectivoDetectadasPorHeuristica.map(
      (c) => ({ cuentaId: c.cuentaId, codigoInterno: c.codigoInterno, nombre: c.nombre }),
    ),
  };
}
