/**
 * DTO de respuesta del Libro Diario (REQ-LD-07).
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 */

import { Decimal } from '@prisma/client/runtime/library';

import type { ComprobanteLibroDiarioRow } from '../ports/comprobantes-reader.port';

// ============================================================
// Tipos del DTO de respuesta
// ============================================================

export interface LineaLibroDiarioDto {
  codigoCuenta: string;
  nombreCuenta: string;
  /** Glosa de la línea (nullable — no todas las líneas tienen glosa). */
  glosa: string | null;
  /** Monto debe en BOB como string decimal. "0.00" si es haber. (§4.5) */
  debeBob: string;
  /** Monto haber en BOB como string decimal. "0.00" si es debe. (§4.5) */
  haberBob: string;
}

export interface AsientoLibroDiarioDto {
  id: string;
  /** Fecha contable calendario puro: "YYYY-MM-DD" (§4.6). */
  fechaContable: string;
  /** Número correlativo. Null en BORRADOR, pero el Libro Diario nunca muestra BORRADOR. */
  numero: string | null;
  tipo: string;
  estado: string;
  glosa: string;
  /** Flag de anulación ortogonal al estado (§4.7 CLAUDE.md). */
  anulado: boolean;
  lineas: LineaLibroDiarioDto[];
}

export interface LibroDiarioResponseDto {
  rango: {
    fechaDesde: string;
    fechaHasta: string;
  };
  asientos: AsientoLibroDiarioDto[];
  /** Suma de todos los debitoBob de las líneas incluidas. (§4.6) */
  totalDebeBob: string;
  /** Suma de todos los creditoBob de las líneas incluidas. En asientos válidos: === totalDebeBob. */
  totalHaberBob: string;
}

// ============================================================
// Mapper: filas Prisma → DTO (design decisión #1)
// ============================================================

/**
 * Formatea una fecha Date a "YYYY-MM-DD" usando UTC para evitar desfases de TZ.
 * FechaContable es @db.Date → Prisma lo devuelve como Date UTC con hora 00:00:00Z.
 * (CLAUDE.md §4.6)
 */
function formatFechaContable(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
    const lineas: LineaLibroDiarioDto[] = row.lineas.map((linea) => {
      // Acumular totales (partida doble §4.1: totalDebe === totalHaber al final)
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
