/**
 * DTO de respuesta del Libro Diario (REQ-LD-07).
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 */

import { ApiProperty } from '@nestjs/swagger';
import { Decimal } from '@prisma/client/runtime/library';

import { formatFechaContable } from '../fecha-contable';
import type { ComprobanteLibroDiarioRow } from '../ports/comprobantes-reader.port';

// ============================================================
// Tipos del DTO de respuesta
// ============================================================

export class LineaLibroDiarioDto {
  @ApiProperty() codigoCuenta!: string;
  @ApiProperty() nombreCuenta!: string;
  /** Glosa de la línea (nullable — no todas las líneas tienen glosa). */
  @ApiProperty({ type: String, nullable: true }) glosa!: string | null;
  /** Monto debe en BOB como string decimal. "0.00" si es haber. (§4.5) */
  @ApiProperty({ example: '1000.00' }) debeBob!: string;
  /** Monto haber en BOB como string decimal. "0.00" si es debe. (§4.5) */
  @ApiProperty({ example: '0.00' }) haberBob!: string;
}

export class AsientoLibroDiarioDto {
  @ApiProperty() id!: string;
  /** Fecha contable calendario puro: "YYYY-MM-DD" (§4.6). */
  @ApiProperty({ example: '2026-04-22' }) fechaContable!: string;
  /** Número correlativo. Null en BORRADOR, pero el Libro Diario nunca muestra BORRADOR. */
  @ApiProperty({ type: String, nullable: true, example: 'I2604-000042' })
  numero!: string | null;
  @ApiProperty() tipo!: string;
  @ApiProperty() estado!: string;
  @ApiProperty() glosa!: string;
  /** Flag de anulación ortogonal al estado (§4.7 CLAUDE.md). */
  @ApiProperty() anulado!: boolean;
  @ApiProperty({ type: () => [LineaLibroDiarioDto] }) lineas!: LineaLibroDiarioDto[];
  /** Suma de los debeBob de las líneas del asiento (subtotal del comprobante). (§4.5) */
  @ApiProperty({ example: '14593.00' }) totalDebeBob!: string;
  /** Suma de los haberBob de las líneas del asiento. En un asiento válido: === totalDebeBob. */
  @ApiProperty({ example: '14593.00' }) totalHaberBob!: string;
}

export class RangoFechasDto {
  @ApiProperty({ example: '2026-04-01' }) fechaDesde!: string;
  @ApiProperty({ example: '2026-04-30' }) fechaHasta!: string;
}

export class LibroDiarioResponseDto {
  @ApiProperty({ type: () => RangoFechasDto }) rango!: RangoFechasDto;
  @ApiProperty({ type: () => [AsientoLibroDiarioDto] }) asientos!: AsientoLibroDiarioDto[];
  /** Suma de todos los debitoBob de las líneas incluidas. (§4.6) */
  @ApiProperty({ example: '1000.00' }) totalDebeBob!: string;
  /** Suma de todos los creditoBob de las líneas incluidas. En asientos válidos: === totalDebeBob. */
  @ApiProperty({ example: '1000.00' }) totalHaberBob!: string;
}

// ============================================================
// Mapper: filas Prisma → DTO (design decisión #1)
// ============================================================

/**
 * Convierte un Decimal de Prisma a string con 2 decimales fijos.
 * (CLAUDE.md §4.5: montos nunca como number en DTOs)
 */
function decimalToString(value: Decimal): string {
  return value.toFixed(2);
}

/**
 * Mapea filas Prisma crudas (ComprobanteLibroDiarioRow[]) al DTO de respuesta
 * del Libro Diario. Calcula totales sumando todas las líneas incluidas.
 *
 * @param rows  - Resultado directo de ComprobantesReaderPort.obtenerAsientosParaLibroDiario
 * @param rango - Rango resuelto { desde, hasta } (período o fechas directas)
 */
export function toLibroDiarioResponse(
  rows: ComprobanteLibroDiarioRow[],
  rango: { desde: Date; hasta: Date },
): LibroDiarioResponseDto {
  let totalDebeAcc = new Decimal(0);
  let totalHaberAcc = new Decimal(0);

  const asientos: AsientoLibroDiarioDto[] = rows.map((row) => {
    let asientoDebeAcc = new Decimal(0);
    let asientoHaberAcc = new Decimal(0);

    const lineas: LineaLibroDiarioDto[] = row.lineas.map((linea) => {
      // Subtotal del asiento (partida doble §4.1: debe === haber por comprobante)
      asientoDebeAcc = asientoDebeAcc.plus(linea.debitoBob);
      asientoHaberAcc = asientoHaberAcc.plus(linea.creditoBob);
      // Total general del libro
      totalDebeAcc = totalDebeAcc.plus(linea.debitoBob);
      totalHaberAcc = totalHaberAcc.plus(linea.creditoBob);

      return {
        codigoCuenta: linea.cuenta.codigoInterno,
        nombreCuenta: linea.cuenta.nombre,
        glosa: linea.glosaLinea,
        debeBob: decimalToString(linea.debitoBob),
        haberBob: decimalToString(linea.creditoBob),
      };
    });

    return {
      id: row.id,
      fechaContable: formatFechaContable(row.fechaContable),
      numero: row.numero,
      tipo: row.tipo,
      estado: row.estado,
      glosa: row.glosa,
      anulado: row.anulado,
      lineas,
      totalDebeBob: decimalToString(asientoDebeAcc),
      totalHaberBob: decimalToString(asientoHaberAcc),
    };
  });

  return {
    rango: {
      fechaDesde: formatFechaContable(rango.desde),
      fechaHasta: formatFechaContable(rango.hasta),
    },
    asientos,
    totalDebeBob: decimalToString(totalDebeAcc),
    totalHaberBob: decimalToString(totalHaberAcc),
  };
}
