import type { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================
// Símbolo de inyección
// ============================================================

export const BALANCE_READER_PORT = Symbol('BALANCE_READER_PORT');

// ============================================================
// Tipos de datos retornados por el port
// ============================================================

/**
 * Saldo neto acumulado de una cuenta HOJA hasta la fecha de corte (inclusive).
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
}

/** Filtros para las queries de saldos del Balance. */
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
 * Port de lectura para el Balance General.
 *
 * Dueño del contrato: módulo `reportes` (§3.7 CLAUDE.md).
 * Difiere de `LibroMayorReaderPort` porque el Balance necesita saldos
 * AGREGADOS por cuenta (no movimientos individuales) + estructura jerárquica.
 *
 * NO importa el repositorio de `comprobantes` ni de `cuentas` (§3.3 CLAUDE.md):
 * `reportes` define su propia superficie de lectura, como ya hace con el Mayor.
 */
export abstract class BalanceReaderPort {
  /**
   * Saldo neto agregado por cuenta (GROUP BY cuentaId) de las líneas
   * CONTABILIZADO/BLOQUEADO con c.fechaContable <= fechaCorte.
   *
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
   * (ambos inclusive) — usada para el Resultado del Ejercicio de la gestión vigente.
   *
   * Misma fuente de verdad que `obtenerSaldosHasta`: GROUP BY cuentaId, mismos
   * estados/filtros, mismo predicado organizationId. Solo cambia el rango de fecha.
   * // organizationId SIEMPRE primer predicado (§4.2 Anti-31)
   */
  abstract obtenerSaldosEnRango(
    tenantId: string,
    desde: Date,
    hasta: Date,
    incluirAnulados: boolean,
  ): Promise<SaldoCuentaRow[]>;

  /**
   * Estructura de TODAS las cuentas ACTIVAS del tenant (activa=true), incluidas
   * las agrupadoras sin movimiento (son nodos estructurales del árbol).
   *
   * findMany simple scoped por organizationId (defense in depth §4.2 CLAUDE.md).
   * // organizationId SIEMPRE primer predicado (§4.2 Anti-31)
   */
  abstract obtenerEstructuraCuentas(tenantId: string): Promise<CuentaEstructuraRow[]>;
}
