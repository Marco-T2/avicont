import { Decimal } from '@prisma/client/runtime/library';

import type {
  ActividadFlujo,
  ClaseCuenta,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/common/domain/enums';

// ============================================================
// Símbolo de inyección
// ============================================================

export const EEFF_SALDOS_READER_PORT = Symbol('EEFF_SALDOS_READER_PORT');

// ============================================================
// Tipos de datos retornados por el port
// ============================================================

/**
 * Saldo neto acumulado de una cuenta HOJA hasta la fecha de corte (inclusive),
 * o saldo de flujo de una cuenta HOJA en un rango [desde, hasta].
 * COALESCE(SUM(lc.debitoBob),0) / COALESCE(SUM(lc.creditoBob),0) desde el adapter.
 */
export interface SaldoCuentaRow {
  cuentaId: string;
  /** COALESCE(SUM(lc.debitoBob),0) — string Postgres → Decimal en adapter. */
  totalDebitoBob: Decimal;
  /** COALESCE(SUM(lc.creditoBob),0) — string Postgres → Decimal en adapter. */
  totalCreditoBob: Decimal;
}

/** Metadata estructural de una cuenta (para armar el árbol). TODAS las activas del tenant. */
export interface CuentaEstructuraRow {
  id: string;
  parentId: string | null;
  nivel: number;
  esDetalle: boolean;
  /** Si true, esta cuenta RESTA del total de su grupo en vez de sumar. */
  esContraria: boolean;
  claseCuenta: ClaseCuenta;
  subClaseCuenta: SubClaseCuenta | null;
  naturaleza: NaturalezaCuenta;
  codigoInterno: string;
  nombre: string;
  /** Actividad del EFE (NIC 7). Null → el reporte aplica default heurístico. */
  actividadFlujo: ActividadFlujo | null;
}

/**
 * Saldos de una cuenta en un rango, con débitos/créditos separados por tipo de
 * comprobante: ORDINARIO (todos los tipos excepto AJUSTE y CIERRE) vs AJUSTE.
 *
 * Usado exclusivamente por la Hoja de Trabajo de 12 columnas (cols 5–6 = ajustes,
 * cols 1–2 = sumas ordinarias). El Balance de Comprobación usa `SaldoCuentaRow`
 * sin separación porque allí no importa el tipo de comprobante.
 *
 * // §4.9 CLAUDE.md: CIERRE excluido de la Hoja de Trabajo — los asientos de
 * // cierre distorsionan las secciones de ER y BG (llevan saldos a cero con
 * // contrapartidas cruzadas que no corresponden al período analizado).
 */
export interface SaldoCuentaSeparadoRow {
  cuentaId: string;
  /** COALESCE(SUM(lc.debitoBob)  FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) */
  debitoOrdinarioBob: Decimal;
  /** COALESCE(SUM(lc.creditoBob) FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) */
  creditoOrdinarioBob: Decimal;
  /** COALESCE(SUM(lc.debitoBob)  FILTER (WHERE c.tipo = 'AJUSTE'), 0) */
  debitoAjusteBob: Decimal;
  /** COALESCE(SUM(lc.creditoBob) FILTER (WHERE c.tipo = 'AJUSTE'), 0) */
  creditoAjusteBob: Decimal;
}

/** Filtros para las queries de saldos de corte histórico (Balance General). */
export interface BalanceFiltros {
  /** Corte inclusive: líneas con c.fechaContable <= fechaCorte. */
  fechaCorte: Date;
  /** Si true, incluye comprobantes con anulado=true. Default false (§4.7). */
  incluirAnulados: boolean;
}

// ============================================================
// Port abstracto
// ============================================================

/**
 * Port de lectura de saldos de cuentas para Estados Financieros (EEFF).
 *
 * Sirve a AMBOS estados financieros: Balance General y Estado de Resultados.
 * El nombre refleja el concepto de dominio ("leer saldos para EEFF"), no el
 * reporte particular (§3.7 CLAUDE.md — Screaming Architecture, D-01 design).
 *
 * Dueño del contrato: módulo `reportes` (§3.7 CLAUDE.md).
 * Difiere de `LibroMayorReaderPort` porque los EEFF necesitan saldos
 * AGREGADOS por cuenta (no movimientos individuales) + estructura jerárquica.
 *
 * NO importa el repositorio de `comprobantes` ni de `cuentas` (§3.3 CLAUDE.md):
 * `reportes` define su propia superficie de lectura, como ya hace con el Mayor.
 */
export abstract class EeffSaldosReaderPort {
  /**
   * Saldo neto agregado por cuenta (GROUP BY cuentaId) de las líneas
   * CONTABILIZADO/BLOQUEADO con c.fechaContable <= fechaCorte.
   *
   * Usado por el Balance General (saldo histórico acumulado).
   * BORRADOR NUNCA (§4.1 CLAUDE.md). organizationId SIEMPRE primer predicado
   * (§4.2 Anti-31 — bug de seguridad si falta).
   *
   * Las cuentas INGRESO/EGRESO TAMBIÉN se devuelven: el service las usa para el
   * Resultado del Ejercicio (acotado por rango de gestión) y NUNCA las cuelga
   * del árbol del Balance (el Balance solo presenta ACTIVO/PASIVO/PATRIMONIO).
   *
   * Cuenta sin movimiento puede no aparecer — el service la trata como saldo 0.
   * // organizationId SIEMPRE primer predicado (§4.2 Anti-31)
   */
  abstract obtenerSaldosHasta(tenantId: string, filtros: BalanceFiltros): Promise<SaldoCuentaRow[]>;

  /**
   * Suma de débitos/créditos por cuenta acotada a un rango [desde, hasta]
   * (ambos inclusive).
   *
   * Usado por el Balance General (Resultado del Ejercicio de la gestión) Y por
   * el Estado de Resultados (saldos de flujo del período — las cuentas de
   * resultado parten de 0 al inicio del rango).
   *
   * Misma fuente de verdad que `obtenerSaldosHasta`: GROUP BY cuentaId, mismos
   * estados/filtros, mismo predicado organizationId. Solo cambia el rango de fecha.
   *
   * @param excluirCierre - si true, excluye comprobantes tipo CIERRE del rango
   *   (mismo criterio que `obtenerSaldosEnRangoSeparandoAjustes`, §4.9 CLAUDE.md).
   *   Lo usa el Estado de Flujo de Efectivo: su resultado de operación debe partir
   *   del resultado OPERATIVO del período, no del residuo post-cierre (los asientos
   *   de CIERRE ponen ingresos/egresos en cero y trasladan el resultado al patrimonio,
   *   lo que doble-contaría / descuadraría el EFE). Default false: BG/ER/Balance de
   *   Comprobación/EEPN mantienen el comportamiento histórico (incluyen CIERRE).
   * // organizationId SIEMPRE primer predicado (§4.2 Anti-31)
   */
  abstract obtenerSaldosEnRango(
    tenantId: string,
    desde: Date,
    hasta: Date,
    incluirAnulados: boolean,
    excluirCierre?: boolean,
  ): Promise<SaldoCuentaRow[]>;

  /**
   * Estructura de TODAS las cuentas ACTIVAS del tenant (activa=true), incluidas
   * las agrupadoras sin movimiento (son nodos estructurales del árbol).
   *
   * findMany simple scoped por organizationId (defense in depth §4.2 CLAUDE.md).
   * // organizationId SIEMPRE primer predicado (§4.2 Anti-31)
   */
  abstract obtenerEstructuraCuentas(tenantId: string): Promise<CuentaEstructuraRow[]>;

  /**
   * Suma de débitos/créditos por cuenta en [desde, hasta], separando comprobantes
   * ORDINARIOS (tipos NO-AJUSTE, NO-CIERRE) de los de tipo AJUSTE.
   *
   * Usado por la Hoja de Trabajo de 12 columnas para alimentar:
   *   - Cols 1–2 (Sumas): debitoOrdinarioBob / creditoOrdinarioBob
   *   - Cols 5–6 (Ajustes): debitoAjusteBob / creditoAjusteBob
   *
   * Los comprobantes de tipo CIERRE son SIEMPRE excluidos (§4.9 CLAUDE.md):
   * distorsionan los saldos ER/BG al hacer cero los resultados del ejercicio.
   *
   * Mismas condiciones base que `obtenerSaldosEnRango`: estados CONTABILIZADO/
   * BLOQUEADO, organizationId SIEMPRE primer predicado (Anti-31).
   * // organizationId SIEMPRE primer predicado (§4.2 Anti-31)
   */
  abstract obtenerSaldosEnRangoSeparandoAjustes(
    tenantId: string,
    desde: Date,
    hasta: Date,
    incluirAnulados: boolean,
  ): Promise<SaldoCuentaSeparadoRow[]>;
}
