/**
 * DTO de respuesta del Estado de Resultados (Income Statement).
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 *
 * Tipos internos del service (*Calculado con Money) separados de los DTO (string),
 * igual que el Balance. El mapper serializa Money → string y Date → "YYYY-MM-DD".
 *
 * Sin línea sintética: el Resultado del Ejercicio es un campo escalar en raíz,
 * no se inserta en el árbol INGRESO/EGRESO.
 */

import type { ClaseCuenta, SubClaseCuenta } from '@prisma/client';

import { Money } from '@/common/domain/money';

import { formatFechaContable } from './balance-response.dto';

// ============================================================
// Tipos internos (Money — antes de serializar)
// ============================================================

/** Cuenta del Estado de Resultados ya calculada con Money. Sin esSintetica (no hay línea sintética). */
export interface CuentaResultadosCalculada {
  cuentaId: string;
  codigoInterno: string;
  nombre: string;
  nivel: number;
  esContraria: boolean;
  saldoBob: Money;
}

/** Subsección del Estado de Resultados calculada con Money. */
export interface SubseccionResultadosCalculada {
  subClaseCuenta: SubClaseCuenta;
  titulo: string;
  cuentas: CuentaResultadosCalculada[];
  totalBob: Money;
}

/** Sección calculada con Money (INGRESO o EGRESO). */
export interface SeccionResultadosCalculada {
  claseCuenta: ClaseCuenta;
  titulo: string;
  subsecciones: SubseccionResultadosCalculada[];
  totalBob: Money;
}

/** Resultado del árbol construido por `resultados-arbol.ts`. */
export interface EstadoResultadosArbolResult {
  ingreso: SeccionResultadosCalculada;
  egreso: SeccionResultadosCalculada;
  /** Código Tributario art. 47: ResultadoEjercicio = Σ Ingresos − Σ Egresos del período. */
  resultadoEjercicioBob: Money;
}

// ============================================================
// Tipos del DTO de respuesta (string — serializados)
// ============================================================

/** Cuenta del Estado de Resultados en el DTO. Sin esSintetica. */
export interface CuentaResultadosDto {
  cuentaId: string;
  codigoInterno: string;
  nombre: string;
  nivel: number;
  esContraria: boolean;
  /** Saldo neto de flujo en BOB como string decimal (§4.5 CLAUDE.md). */
  saldoBob: string;
}

export interface SubseccionResultadosDto {
  subClaseCuenta: string;
  titulo: string;
  cuentas: CuentaResultadosDto[];
  /** Total de la subsección en BOB como string decimal (§4.5 CLAUDE.md). */
  totalBob: string;
}

export interface SeccionResultadosDto {
  claseCuenta: string;
  titulo: string;
  subsecciones: SubseccionResultadosDto[];
  /** Total de la sección en BOB como string decimal (§4.5 CLAUDE.md). */
  totalBob: string;
}

export interface EstadoResultadosResponseDto {
  /** Inicio del rango de flujo. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  fechaDesde: string;
  /** Fin del rango de flujo. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  fechaHasta: string;
  ingreso: SeccionResultadosDto;
  egreso: SeccionResultadosDto;
  /** Resultado del Ejercicio = Σ INGRESO − Σ EGRESO; puede ser negativo (pérdida). String decimal. */
  resultadoEjercicioBob: string;
  /** Atajo: = ingreso.totalBob */
  totalIngresoBob: string;
  /** Atajo: = egreso.totalBob */
  totalEgresoBob: string;
  /**
   * true si resultadoEjercicio >= 0 (utilidad o break-even).
   * Conveniencia para el frontend.
   */
  esGanancia: boolean;
}

// ============================================================
// Mapper: EstadoResultadosArbolResult → EstadoResultadosResponseDto
// ============================================================

function mapSeccionResultados(seccion: SeccionResultadosCalculada): SeccionResultadosDto {
  return {
    claseCuenta: seccion.claseCuenta,
    titulo: seccion.titulo,
    subsecciones: seccion.subsecciones.map((sub) => ({
      subClaseCuenta: sub.subClaseCuenta,
      titulo: sub.titulo,
      cuentas: sub.cuentas.map((c) => ({
        cuentaId: c.cuentaId,
        codigoInterno: c.codigoInterno,
        nombre: c.nombre,
        nivel: c.nivel,
        esContraria: c.esContraria,
        saldoBob: c.saldoBob.toBob(),
      })),
      totalBob: sub.totalBob.toBob(),
    })),
    totalBob: seccion.totalBob.toBob(),
  };
}

/**
 * Mapea el árbol calculado al DTO de respuesta del Estado de Resultados.
 * Serializa Money → string con toBob() y Date → "YYYY-MM-DD".
 *
 * @param arbol  - Árbol calculado por resultados-arbol.ts
 * @param rango  - Rango de fechas del flujo consultado
 */
export function toEstadoResultadosResponse(
  arbol: EstadoResultadosArbolResult,
  rango: { desde: Date; hasta: Date },
): EstadoResultadosResponseDto {
  // NCB / NIC 1: Estado de Resultados de flujo del período, sin arrastre histórico.
  return {
    fechaDesde: formatFechaContable(rango.desde),
    fechaHasta: formatFechaContable(rango.hasta),
    ingreso: mapSeccionResultados(arbol.ingreso),
    egreso: mapSeccionResultados(arbol.egreso),
    resultadoEjercicioBob: arbol.resultadoEjercicioBob.toBob(),
    totalIngresoBob: arbol.ingreso.totalBob.toBob(),
    totalEgresoBob: arbol.egreso.totalBob.toBob(),
    // esGanancia=true cuando resultado >= 0 (utilidad o break-even)
    esGanancia: arbol.resultadoEjercicioBob.greaterThanOrEqualTo(Money.ZERO),
  };
}
