/**
 * DTO de respuesta del Estado de Evolución del Patrimonio Neto (EEPN).
 *
 * 4º estado financiero formal boliviano (NCB / Código de Comercio art. 36 y ss).
 * Nivel A+ (data-derived): por cada componente del patrimonio muestra
 * `saldoInicial / resultadoEjercicio / otrosMovimientos / saldoFinal`. El
 * Resultado del Ejercicio se NOMBRA (computado del rango); el resto de los
 * movimientos se agrupan en un catch-all honesto ("Otros movimientos") porque
 * un sistema contable genérico no clasifica el motivo (aporte vs distribución).
 * El nivel B (matriz NIC 1 completa: filas por concepto + fila de "apropiación del
 * resultado" que reclasifica el resultado del ejercicio dentro del patrimonio
 * post-cierre) queda DIFERIDO — requiere clasificación de movimientos y el feature
 * de cierre de ejercicio. Ver builder evolucion-patrimonio.ts (asimetría con EFE/ER).
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 *
 * Tipos internos del builder (*Calculado con Money) separados de los DTO (string),
 * igual que el Balance General. El mapper serializa Money → string y Date → "YYYY-MM-DD".
 */

import { ApiProperty } from '@nestjs/swagger';

import { Money } from '@/common/domain/money';

import { formatFechaContable } from '../fecha-contable';

// ============================================================
// Tipos internos del builder (Money — antes de serializar)
// ============================================================

/**
 * Un componente (columna) del patrimonio con sus 4 valores de movimiento.
 * `cuentaId === null` y `esSintetica === true` marcan la columna del
 * Resultado del Ejercicio (en curso), que no corresponde a una cuenta del Mayor.
 */
export interface ComponentePatrimonioCalculado {
  cuentaId: string | null;
  codigoInterno: string | null;
  nombre: string;
  /** Si true, este componente RESTA del total del patrimonio (espejo de la propagación del Balance). */
  esContraria: boolean;
  /** true solo para "Resultado del Ejercicio (en curso)". */
  esSintetica: boolean;
  saldoInicialBob: Money;
  resultadoEjercicioBob: Money;
  otrosMovimientosBob: Money;
  saldoFinalBob: Money;
  /**
   * true si saldoInicial + resultado + otrosMovimientos ≈ saldoFinal (±Bs 0.01).
   * Chequeo de CONSISTENCIA de las 3 lecturas + matemática de fechas, NO de validez
   * contable: en datos íntegros da true por construcción (ver builder).
   */
  cuadra: boolean;
  /** (saldoInicial + resultado + otrosMovimientos) − saldoFinal. "0.00" si cuadra. */
  diferenciaBob: Money;
}

/** Totales por concepto (suma de las columnas aplicando esContraria). */
export interface TotalesEvolucionPatrimonioCalculado {
  saldoInicialBob: Money;
  resultadoEjercicioBob: Money;
  otrosMovimientosBob: Money;
  saldoFinalBob: Money;
}

/** Resultado del builder `evolucion-patrimonio.ts` — ya con cuadres calculados. */
export interface EvolucionPatrimonioResult {
  componentes: ComponentePatrimonioCalculado[];
  totales: TotalesEvolucionPatrimonioCalculado;
  /** true si todos los componentes cuadran Y el total cuadra. */
  cuadra: boolean;
  diferenciaBob: Money;
}

// ============================================================
// Tipos del DTO de respuesta (string — serializados)
// ============================================================

export class ComponentePatrimonioDto {
  @ApiProperty({ type: String, nullable: true }) cuentaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) codigoInterno!: string | null;
  @ApiProperty() nombre!: string;
  @ApiProperty() esContraria!: boolean;
  @ApiProperty() esSintetica!: boolean;
  /** Saldo del patrimonio al inicio del período (BOB string, §4.5). */
  @ApiProperty({ example: '100000.00' }) saldoInicialBob!: string;
  /** Resultado del ejercicio imputado a este componente (BOB string). */
  @ApiProperty({ example: '0.00' }) resultadoEjercicioBob!: string;
  /** Otros movimientos netos del período sin clasificar (BOB string). */
  @ApiProperty({ example: '0.00' }) otrosMovimientosBob!: string;
  /** Saldo del patrimonio al cierre del período (BOB string). */
  @ApiProperty({ example: '100000.00' }) saldoFinalBob!: string;
  @ApiProperty() cuadra!: boolean;
  @ApiProperty({ example: '0.00' }) diferenciaBob!: string;
}

export class TotalesEvolucionPatrimonioDto {
  @ApiProperty({ example: '125000.00' }) saldoInicialBob!: string;
  @ApiProperty({ example: '30000.00' }) resultadoEjercicioBob!: string;
  @ApiProperty({ example: '40000.00' }) otrosMovimientosBob!: string;
  @ApiProperty({ example: '195000.00' }) saldoFinalBob!: string;
}

export class EvolucionPatrimonioResponseDto {
  /** Inicio del período evaluado. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-01-01' }) fechaDesde!: string;
  /** Fin del período evaluado. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-12-31' }) fechaHasta!: string;
  @ApiProperty({ type: () => [ComponentePatrimonioDto] })
  componentes!: ComponentePatrimonioDto[];
  @ApiProperty({ type: () => TotalesEvolucionPatrimonioDto })
  totales!: TotalesEvolucionPatrimonioDto;
  /**
   * true si la evolución cuadra: saldoInicial + resultado + otrosMovimientos ≈ saldoFinal
   * por componente y en el total (±Bs 0.01). Es un chequeo de CONSISTENCIA entre las
   * lecturas (inicial/final/rango) y la matemática de fechas, NO de validez contable.
   * HTTP 200 siempre — el descuadre es dato, no error.
   */
  @ApiProperty() cuadra!: boolean;
  @ApiProperty({ example: '0.00' }) diferenciaBob!: string;
}

// ============================================================
// Mapper: EvolucionPatrimonioResult → EvolucionPatrimonioResponseDto
// ============================================================

/**
 * Mapea el resultado calculado del builder al DTO de respuesta.
 * Serializa Money → string con toBob() y Date → "YYYY-MM-DD".
 */
export function toEvolucionPatrimonioResponse(
  result: EvolucionPatrimonioResult,
  contexto: { desde: Date; hasta: Date },
): EvolucionPatrimonioResponseDto {
  return {
    fechaDesde: formatFechaContable(contexto.desde),
    fechaHasta: formatFechaContable(contexto.hasta),
    componentes: result.componentes.map((c) => ({
      cuentaId: c.cuentaId,
      codigoInterno: c.codigoInterno,
      nombre: c.nombre,
      esContraria: c.esContraria,
      esSintetica: c.esSintetica,
      saldoInicialBob: c.saldoInicialBob.toBob(),
      resultadoEjercicioBob: c.resultadoEjercicioBob.toBob(),
      otrosMovimientosBob: c.otrosMovimientosBob.toBob(),
      saldoFinalBob: c.saldoFinalBob.toBob(),
      cuadra: c.cuadra,
      diferenciaBob: c.diferenciaBob.toBob(),
    })),
    totales: {
      saldoInicialBob: result.totales.saldoInicialBob.toBob(),
      resultadoEjercicioBob: result.totales.resultadoEjercicioBob.toBob(),
      otrosMovimientosBob: result.totales.otrosMovimientosBob.toBob(),
      saldoFinalBob: result.totales.saldoFinalBob.toBob(),
    },
    cuadra: result.cuadra,
    diferenciaBob: result.diferenciaBob.toBob(),
  };
}
