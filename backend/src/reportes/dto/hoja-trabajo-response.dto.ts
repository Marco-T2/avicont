/**
 * DTO de respuesta de la Hoja de Trabajo de 12 Columnas.
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 *
 * La Hoja de Trabajo es una LISTA PLANA de cuentas de detalle (más una fila
 * sintética de carry-over opcional), con 12 columnas más metadatos de cuadre.
 *
 * Campos nullable (`cuentaId`, `codigoInterno`): son null en la fila sintética de
 * Utilidad/Pérdida del Ejercicio. Se usa `@ApiProperty({ nullable: true, type: String })`
 * para que Swagger los emita como `string | null` (cicatriz §10.10 — no usar `type: Object`
 * ni omitir `type:` que genera `Record<string,never>`).
 */

import { ApiProperty } from '@nestjs/swagger';

import type { ClaseCuenta, NaturalezaCuenta } from '@/common/domain/enums';

import { formatFechaContable } from '../fecha-contable';
import { CuentaNaturalezaOpuestaDto } from './balance-comprobacion-response.dto';
import type { HojaTrabajoResult, LineaHojaTrabajoCalculada } from '../domain/hoja-trabajo';

// Re-export so controller can import from one place
export { CuentaNaturalezaOpuestaDto };

// ============================================================
// Clases de respuesta HTTP (strings)
// ============================================================

export class LineaHojaTrabajoDto {
  /** null para la fila sintética de Utilidad/Pérdida del Ejercicio. */
  @ApiProperty({ nullable: true, type: String }) cuentaId!: string | null;
  /** null para la fila sintética de Utilidad/Pérdida del Ejercicio. */
  @ApiProperty({ nullable: true, type: String }) codigoInterno!: string | null;
  @ApiProperty() nombre!: string;
  /** "DEUDORA" | "ACREEDORA" | null (fila sintética). */
  @ApiProperty({ nullable: true, type: String }) naturaleza!: string | null;
  /** "ACTIVO" | "PASIVO" | "PATRIMONIO" | "INGRESO" | "EGRESO" | null (fila sintética). */
  @ApiProperty({ nullable: true, type: String }) claseCuenta!: string | null;
  @ApiProperty() esContraria!: boolean;
  /** true solo para la fila de Utilidad/Pérdida del Ejercicio. */
  @ApiProperty() esSintetica!: boolean;
  /** Columna 1: Σ débitos de comprobantes NO-AJUSTE del rango. String decimal (§4.5). */
  @ApiProperty({ example: '1000.00' }) sumasDebe!: string;
  /** Columna 2: Σ créditos de comprobantes NO-AJUSTE del rango. String decimal (§4.5). */
  @ApiProperty({ example: '0.00' }) sumasHaber!: string;
  /** Columna 3: MAX(sumasDebe − sumasHaber, 0). String decimal (§4.5). */
  @ApiProperty({ example: '1000.00' }) saldoDeudor!: string;
  /** Columna 4: MAX(sumasHaber − sumasDebe, 0). String decimal (§4.5). */
  @ApiProperty({ example: '0.00' }) saldoAcreedor!: string;
  /** Columna 5: Σ débitos de comprobantes AJUSTE del rango. String decimal (§4.5). */
  @ApiProperty({ example: '0.00' }) ajustesDebe!: string;
  /** Columna 6: Σ créditos de comprobantes AJUSTE del rango. String decimal (§4.5). */
  @ApiProperty({ example: '0.00' }) ajustesHaber!: string;
  /** Columna 7: MAX((sumasDebe+ajustesDebe)−(sumasHaber+ajustesHaber), 0). String decimal. */
  @ApiProperty({ example: '1000.00' }) saldoAjustadoDeudor!: string;
  /** Columna 8: MAX((sumasHaber+ajustesHaber)−(sumasDebe+ajustesDebe), 0). String decimal. */
  @ApiProperty({ example: '0.00' }) saldoAjustadoAcreedor!: string;
  /** Columna 9: Pérdidas del Estado de Resultados. String decimal (§4.5). */
  @ApiProperty({ example: '0.00' }) erPerdidas!: string;
  /** Columna 10: Ganancias del Estado de Resultados. String decimal (§4.5). */
  @ApiProperty({ example: '0.00' }) erGanancias!: string;
  /** Columna 11: Activo del Balance General. String decimal (§4.5). */
  @ApiProperty({ example: '1000.00' }) bgActivo!: string;
  /** Columna 12: Pasivo + Patrimonio del Balance General. String decimal (§4.5). */
  @ApiProperty({ example: '0.00' }) bgPasPat!: string;
}

export class TotalesHojaTrabajoDto {
  @ApiProperty({ example: '5000.00' }) sumasDebe!: string;
  @ApiProperty({ example: '5000.00' }) sumasHaber!: string;
  @ApiProperty({ example: '5000.00' }) saldoDeudor!: string;
  @ApiProperty({ example: '5000.00' }) saldoAcreedor!: string;
  @ApiProperty({ example: '0.00' }) ajustesDebe!: string;
  @ApiProperty({ example: '0.00' }) ajustesHaber!: string;
  @ApiProperty({ example: '5000.00' }) saldoAjustadoDeudor!: string;
  @ApiProperty({ example: '5000.00' }) saldoAjustadoAcreedor!: string;
  @ApiProperty({ example: '5000.00' }) perdidas!: string;
  @ApiProperty({ example: '5000.00' }) ganancias!: string;
  @ApiProperty({ example: '5000.00' }) activo!: string;
  @ApiProperty({ example: '5000.00' }) pasivoPatrimonio!: string;
}

export class CuadresHojaTrabajoDto {
  /** true si los 6 cuadres individuales son todos true (tolerancia ±Bs 0.01). */
  @ApiProperty() cuadra!: boolean;
  @ApiProperty() cuadraSumas!: boolean;
  @ApiProperty() cuadraSaldos!: boolean;
  @ApiProperty() cuadraAjustes!: boolean;
  @ApiProperty() cuadraSaldosAjustados!: boolean;
  @ApiProperty() cuadraEstadoResultados!: boolean;
  @ApiProperty() cuadraBalanceGeneral!: boolean;
  @ApiProperty({ example: '0.00' }) diferenciaSumas!: string;
  @ApiProperty({ example: '0.00' }) diferenciaSaldos!: string;
  @ApiProperty({ example: '0.00' }) diferenciaAjustes!: string;
  @ApiProperty({ example: '0.00' }) diferenciaSaldosAjustados!: string;
  @ApiProperty({ example: '0.00' }) diferenciaEstadoResultados!: string;
  @ApiProperty({ example: '0.00' }) diferenciaBalanceGeneral!: string;
}

export class HojaTrabajoResponseDto {
  /** Inicio del rango. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-04-01' }) fechaDesde!: string;
  /** Fin del rango. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-04-30' }) fechaHasta!: string;
  @ApiProperty({ type: () => [LineaHojaTrabajoDto] })
  lineas!: LineaHojaTrabajoDto[];
  @ApiProperty({ type: () => TotalesHojaTrabajoDto })
  totales!: TotalesHojaTrabajoDto;
  @ApiProperty({ type: () => CuadresHojaTrabajoDto })
  cuadres!: CuadresHojaTrabajoDto;
  @ApiProperty({ type: () => [CuentaNaturalezaOpuestaDto] })
  cuentasNaturalezaOpuesta!: CuentaNaturalezaOpuestaDto[];
}

// ============================================================
// Mapper: HojaTrabajoResult → HojaTrabajoResponseDto
// ============================================================

function mapLinea(l: LineaHojaTrabajoCalculada): LineaHojaTrabajoDto {
  return {
    cuentaId: l.cuentaId,
    codigoInterno: l.codigoInterno,
    nombre: l.nombre,
    naturaleza: l.naturaleza as NaturalezaCuenta | null,
    claseCuenta: l.claseCuenta as ClaseCuenta | null,
    esContraria: l.esContraria,
    esSintetica: l.esSintetica,
    sumasDebe: l.sumasDebe.toBob(),
    sumasHaber: l.sumasHaber.toBob(),
    saldoDeudor: l.saldoDeudor.toBob(),
    saldoAcreedor: l.saldoAcreedor.toBob(),
    ajustesDebe: l.ajustesDebe.toBob(),
    ajustesHaber: l.ajustesHaber.toBob(),
    saldoAjustadoDeudor: l.saldoAjustadoDeudor.toBob(),
    saldoAjustadoAcreedor: l.saldoAjustadoAcreedor.toBob(),
    erPerdidas: l.perdidas.toBob(),
    erGanancias: l.ganancias.toBob(),
    bgActivo: l.activo.toBob(),
    bgPasPat: l.pasivoPatrimonio.toBob(),
  };
}

/**
 * Mapea el resultado del builder al DTO de respuesta de la Hoja de Trabajo.
 * Serializa Money → string con `toBob()` (2 decimales, §4.5) y Date →
 * "YYYY-MM-DD" (§4.6).
 */
export function toHojaTrabajoResponse(
  result: HojaTrabajoResult,
  rango: { desde: Date; hasta: Date },
): HojaTrabajoResponseDto {
  const { totales, cuadres, cuentasNaturalezaOpuesta } = result;

  return {
    fechaDesde: formatFechaContable(rango.desde),
    fechaHasta: formatFechaContable(rango.hasta),
    lineas: result.lineas.map(mapLinea),
    totales: {
      sumasDebe: totales.sumasDebe.toBob(),
      sumasHaber: totales.sumasHaber.toBob(),
      saldoDeudor: totales.saldoDeudor.toBob(),
      saldoAcreedor: totales.saldoAcreedor.toBob(),
      ajustesDebe: totales.ajustesDebe.toBob(),
      ajustesHaber: totales.ajustesHaber.toBob(),
      saldoAjustadoDeudor: totales.saldoAjustadoDeudor.toBob(),
      saldoAjustadoAcreedor: totales.saldoAjustadoAcreedor.toBob(),
      perdidas: totales.perdidas.toBob(),
      ganancias: totales.ganancias.toBob(),
      activo: totales.activo.toBob(),
      pasivoPatrimonio: totales.pasivoPatrimonio.toBob(),
    },
    cuadres: {
      cuadra: cuadres.cuadra,
      cuadraSumas: cuadres.cuadraSumas,
      cuadraSaldos: cuadres.cuadraSaldos,
      cuadraAjustes: cuadres.cuadraAjustes,
      cuadraSaldosAjustados: cuadres.cuadraSaldosAjustados,
      cuadraEstadoResultados: cuadres.cuadraEstadoResultados,
      cuadraBalanceGeneral: cuadres.cuadraBalanceGeneral,
      diferenciaSumas: cuadres.diferenciaSumas.toBob(),
      diferenciaSaldos: cuadres.diferenciaSaldos.toBob(),
      diferenciaAjustes: cuadres.diferenciaAjustes.toBob(),
      diferenciaSaldosAjustados: cuadres.diferenciaSaldosAjustados.toBob(),
      diferenciaEstadoResultados: cuadres.diferenciaEstadoResultados.toBob(),
      diferenciaBalanceGeneral: cuadres.diferenciaBalanceGeneral.toBob(),
    },
    cuentasNaturalezaOpuesta: cuentasNaturalezaOpuesta.map((c) => ({
      cuentaId: c.cuentaId,
      codigoInterno: c.codigoInterno,
      nombre: c.nombre,
      naturaleza: c.naturaleza,
      saldoOpuesto: c.saldoOpuesto.toBob(),
    })),
  };
}
