/**
 * DTO de respuesta del Balance General.
 *
 * Montos como string decimal (§4.5 CLAUDE.md): evita pérdida IEEE-754 en JSON.
 * Fechas como "YYYY-MM-DD" (§4.6 CLAUDE.md): fecha calendario puro, sin hora ni UTC.
 *
 * Tipos internos del service (*Calculado con Money) separados de los DTO (string),
 * igual que el Mayor. El mapper serializa Money → string y Date → "YYYY-MM-DD".
 */

import { ApiProperty } from '@nestjs/swagger';

import type { ClaseCuenta, SubClaseCuenta } from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

import { formatFechaContable } from '../fecha-contable';

// ============================================================
// Tipos internos del service (Money — antes de serializar)
// ============================================================

/** Cuenta ya calculada con Money, antes de la serialización a DTO. */
export interface CuentaBalanceCalculada {
  cuentaId: string | null; // null en la línea sintética del Resultado
  codigoInterno: string | null; // null en la línea sintética
  nombre: string;
  nivel: number;
  esContraria: boolean;
  esSintetica: boolean; // true solo para "Resultado del Ejercicio (en curso)"
  saldoBob: Money;
}

/** Subsección calculada con Money. */
export interface SubseccionCalculada {
  subClaseCuenta: SubClaseCuenta;
  titulo: string;
  cuentas: CuentaBalanceCalculada[];
  totalBob: Money;
}

/** Sección calculada con Money. */
export interface SeccionCalculada {
  claseCuenta: ClaseCuenta;
  titulo: string;
  subsecciones: SubseccionCalculada[];
  totalBob: Money;
}

/** Resultado del árbol construido por `balance-arbol.ts` — ya con cuadre calculado. */
export interface BalanceArbolResult {
  activo: SeccionCalculada;
  pasivo: SeccionCalculada;
  patrimonio: SeccionCalculada;
  resultadoEjercicioBob: Money;
  cuadra: boolean;
  diferenciaBob: Money;
}

// ============================================================
// Tipos del DTO de respuesta (string — serializados)
// ============================================================

export class CuentaBalanceDto {
  @ApiProperty({ type: String, nullable: true }) cuentaId!: string | null;
  @ApiProperty({ type: String, nullable: true }) codigoInterno!: string | null;
  @ApiProperty() nombre!: string;
  @ApiProperty() nivel!: number;
  @ApiProperty() esContraria!: boolean;
  @ApiProperty() esSintetica!: boolean;
  /** Saldo neto en BOB como string decimal (§4.5 CLAUDE.md). */
  @ApiProperty({ example: '1000.00' }) saldoBob!: string;
}

export class SubseccionBalanceDto {
  @ApiProperty() subClaseCuenta!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty({ type: () => [CuentaBalanceDto] }) cuentas!: CuentaBalanceDto[];
  /** Total de la subsección en BOB como string decimal (§4.5 CLAUDE.md). */
  @ApiProperty({ example: '1000.00' }) totalBob!: string;
}

export class SeccionBalanceDto {
  @ApiProperty() claseCuenta!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty({ type: () => [SubseccionBalanceDto] }) subsecciones!: SubseccionBalanceDto[];
  /** Total de la sección en BOB como string decimal (§4.5 CLAUDE.md). */
  @ApiProperty({ example: '1000.00' }) totalBob!: string;
}

export class BalanceResponseDto {
  /** Fecha de corte del Balance. Formato "YYYY-MM-DD" (§4.6 CLAUDE.md). */
  @ApiProperty({ example: '2026-04-30' }) fechaCorte!: string;
  /** ID de la gestión fiscal usada para el Resultado del Ejercicio. */
  @ApiProperty() gestionId!: string;
  @ApiProperty({ type: () => SeccionBalanceDto }) activo!: SeccionBalanceDto;
  @ApiProperty({ type: () => SeccionBalanceDto }) pasivo!: SeccionBalanceDto;
  @ApiProperty({ type: () => SeccionBalanceDto }) patrimonio!: SeccionBalanceDto;
  /** Resultado del Ejercicio calculado (Σ INGRESO − Σ EGRESO de la gestión). String decimal. */
  @ApiProperty({ example: '1000.00' }) resultadoEjercicioBob!: string;
  @ApiProperty({ example: '1000.00' }) totalActivoBob!: string;
  @ApiProperty({ example: '1000.00' }) totalPasivoBob!: string;
  @ApiProperty({ example: '1000.00' }) totalPatrimonioBob!: string;
  /**
   * true si |Activo − (Pasivo + Patrimonio)| ≤ ±Bs 0.01.
   * Código Tributario art. 47: Activo = Pasivo + Patrimonio.
   * HTTP 200 siempre — el descuadre es dato, no error (§5.5 design).
   */
  @ApiProperty() cuadra!: boolean;
  /** Activo − (Pasivo + Patrimonio) como string decimal. "0.00" si cuadra. */
  @ApiProperty({ example: '0.00' }) diferenciaBob!: string;
}

// ============================================================
// Mapper: BalanceArbolResult → BalanceResponseDto
// ============================================================

function mapSeccion(seccion: SeccionCalculada): SeccionBalanceDto {
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
        esSintetica: c.esSintetica,
        saldoBob: c.saldoBob.toBob(),
      })),
      totalBob: sub.totalBob.toBob(),
    })),
    totalBob: seccion.totalBob.toBob(),
  };
}

/**
 * Mapea el resultado calculado del árbol al DTO de respuesta.
 * Serializa Money → string con toBob() y Date → "YYYY-MM-DD".
 *
 * @param arbol     - Resultado del service (saldos y árbol ya calculados)
 * @param contexto  - Metadatos de la consulta (fechaCorte, gestionId)
 */
export function toBalanceResponse(
  arbol: BalanceArbolResult,
  contexto: { fechaCorte: Date; gestionId: string },
): BalanceResponseDto {
  return {
    fechaCorte: formatFechaContable(contexto.fechaCorte),
    gestionId: contexto.gestionId,
    activo: mapSeccion(arbol.activo),
    pasivo: mapSeccion(arbol.pasivo),
    patrimonio: mapSeccion(arbol.patrimonio),
    resultadoEjercicioBob: arbol.resultadoEjercicioBob.toBob(),
    totalActivoBob: arbol.activo.totalBob.toBob(),
    totalPasivoBob: arbol.pasivo.totalBob.toBob(),
    totalPatrimonioBob: arbol.patrimonio.totalBob.toBob(),
    cuadra: arbol.cuadra,
    diferenciaBob: arbol.diferenciaBob.toBob(),
  };
}
