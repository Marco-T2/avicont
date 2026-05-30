/**
 * Port cross-módulo definido EN `reportes/ports/` (dueño del contrato).
 * Separado de `ComprobantesReaderPort` (capability Libro Diario) porque el
 * Libro Mayor tiene una forma de query fundamentalmente diferente: $queryRaw
 * JOIN con agregados por cuenta (diseño §Decisión 1 y §Decisión 2).
 *
 * Multi-tenant: TODO query filtra organizationId (CLAUDE.md §4.2 core).
 * BORRADOR NUNCA incluido (REQ-LM-02).
 */

import type { NaturalezaCuenta } from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export const LIBRO_MAYOR_READER_PORT = Symbol('LIBRO_MAYOR_READER_PORT');

/** Filtros resueltos que llegan al adapter (rango siempre como Date). */
export interface LibroMayorFiltros {
  /** ID de cuenta (optional) — si viene, filtra solo esa cuenta. */
  cuentaId?: string;
  /** Inicio del rango calendario — inclusive. */
  fechaDesde: Date;
  /** Fin del rango calendario — inclusive. */
  fechaHasta: Date;
  /** Si true, incluye líneas de comprobantes con anulado=true. Default false. */
  incluirAnulados: boolean;
}

/**
 * Fila plana del JOIN lineas_comprobante ↔ comprobantes ↔ cuentas.
 * Una fila = una línea de comprobante.
 * El service agrupa por cuentaId y calcula running balance.
 *
 * debitoBob/creditoBob son Decimal (construido en el adapter desde string
 * retornado por $queryRaw de Postgres `numeric`).
 */
export interface MovimientoMayorRow {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  naturaleza: NaturalezaCuenta;
  comprobanteId: string;
  numeroComprobante: string | null;
  fechaContable: Date;
  glosa: string;
  glosaLinea: string | null;
  estado: string;
  anulado: boolean;
  orden: number;
  debitoBob: Decimal;
  creditoBob: Decimal;
}

/**
 * Fila del GROUP BY por cuenta para saldo inicial histórico.
 * Acumula débitos y créditos de líneas con fechaContable < fechaDesde.
 *
 * totalDebitoBob/totalCreditoBob son Decimal (construido en el adapter
 * desde string retornado por $queryRaw de Postgres `numeric` con COALESCE).
 */
export interface SaldoInicialRow {
  cuentaId: string;
  codigoInterno: string;
  nombreCuenta: string;
  naturaleza: NaturalezaCuenta;
  totalDebitoBob: Decimal;
  totalCreditoBob: Decimal;
}

/**
 * Resultado de la validación de cuenta — usado antes de ejecutar la query
 * principal para detectar cuenta no encontrada vs cuenta agrupadora.
 */
export interface CuentaDetalleResult {
  id: string;
  esDetalle: boolean;
}

export abstract class LibroMayorReaderPort {
  /**
   * Cuenta líneas de movimientos CONTABILIZADO/BLOQUEADO del rango para el tope
   * defensivo (REQ-LM-12). No incluye BORRADOR. Respeta filtro de anulados y organizationId.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param filtros  - rango de fechas + toggle anulados + cuentaId opcional
   */
  abstract contarMovimientos(tenantId: string, filtros: LibroMayorFiltros): Promise<number>;

  /**
   * Líneas de movimientos CONTABILIZADO/BLOQUEADO del rango, ordenadas
   * cuentaId → fechaContable ASC → numeroComprobante ASC NULLS LAST →
   * comprobanteId ASC → orden ASC (REQ-LM-05 — orden determinístico).
   * BORRADOR nunca incluido (REQ-LM-02).
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param filtros  - rango de fechas + toggle anulados + cuentaId opcional
   */
  abstract obtenerMovimientos(
    tenantId: string,
    filtros: LibroMayorFiltros,
  ): Promise<MovimientoMayorRow[]>;

  /**
   * Saldo histórico acumulado por cuenta para fechaContable < fechaDesde.
   * Filtra por tenant y estados (REQ-LM-04). BORRADOR excluido (REQ-LM-02).
   * Cuenta con historial en cero puede no aparecer en el resultado — el service
   * maneja ese caso con saldoInicial = 0.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param filtros  - fechaDesde como punto de corte + toggle anulados + cuentaId opcional
   */
  abstract obtenerSaldosIniciales(
    tenantId: string,
    filtros: LibroMayorFiltros,
  ): Promise<SaldoInicialRow[]>;

  /**
   * Lookup de cuenta por id scoped al tenant (defense in depth §4.2 CLAUDE.md).
   * Devuelve `null` si el cuentaId no existe o no pertenece al tenant activo.
   * No distingue "no existe" de "no es tuyo" (Anti-31, §4.2).
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param cuentaId - UUID de la cuenta a validar
   */
  abstract obtenerCuentaDetalle(
    tenantId: string,
    cuentaId: string,
  ): Promise<CuentaDetalleResult | null>;
}
