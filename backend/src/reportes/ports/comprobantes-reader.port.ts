/**
 * Port cross-módulo definido EN `reportes/ports/` (dueño del contrato,
 * decisión #6 del design). No importa directamente desde `comprobantes/`.
 *
 * Devuelve filas Prisma crudas (divergencia §5, design decisión #1): el service
 * mapea al DTO en el boundary. El port sigue siendo la frontera — define el TIPO
 * expuesto, no expone Prisma libre.
 *
 * Multi-tenant: TODO query filtra organizationId (CLAUDE.md §4.2 core).
 * BORRADOR NUNCA incluido (REQ-LD-02).
 */

import type {
  Comprobante,
  EstadoComprobante,
  LineaComprobante,
  TipoComprobante,
} from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

export const COMPROBANTES_READER_PORT = Symbol('COMPROBANTES_READER_PORT');

/** Filtros resueltos que llegan al adapter (rango siempre como Date). */
export interface LibroDiarioFiltros {
  /** Inicio del rango calendario — inclusive. */
  fechaDesde: Date;
  /** Fin del rango calendario — inclusive. */
  fechaHasta: Date;
  /** Si true, incluye comprobantes con anulado=true. Default false. */
  incluirAnulados: boolean;
}

/**
 * Fila Prisma cruda que devuelve el adapter (decisión #1: no entidades puras).
 * El service mapea al DTO usando `toLibroDiarioResponse`.
 *
 * Campos seleccionados del Comprobante padre más líneas con cuenta.
 * debitoBob/creditoBob son Decimal de Prisma — el mapper los convierte a string.
 */
export type ComprobanteLibroDiarioRow = Pick<
  Comprobante,
  'id' | 'organizationId' | 'tipo' | 'numero' | 'estado' | 'fechaContable' | 'glosa' | 'anulado'
> & {
  tipo: TipoComprobante;
  estado: EstadoComprobante;
  lineas: ComprobanteLineaLibroDiarioRow[];
};

export type ComprobanteLineaLibroDiarioRow = Pick<LineaComprobante, 'orden' | 'glosaLinea'> & {
  debitoBob: Decimal;
  creditoBob: Decimal;
  cuenta: {
    codigoInterno: string;
    nombre: string;
  };
};

export abstract class ComprobantesReaderPort {
  /**
   * Cuenta asientos CONTABILIZADO/BLOQUEADO del rango para el tope defensivo
   * (REQ-LD-10). No incluye BORRADOR. Respeta filtro de anulados y organizationId.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param filtros  - rango de fechas + toggle anulados (resueltos)
   */
  abstract contarAsientos(tenantId: string, filtros: LibroDiarioFiltros): Promise<number>;

  /**
   * Asientos CONTABILIZADO/BLOQUEADO del rango con líneas (orden ASC) y cuenta.
   * Ordenados fechaContable ASC, numero ASC NULLS LAST, createdAt ASC (REQ-LD-04).
   * Filtrado por organizationId (REQ-LD-08). BORRADOR nunca incluido (REQ-LD-02).
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param filtros  - rango de fechas + toggle anulados (resueltos)
   */
  abstract obtenerAsientosParaLibroDiario(
    tenantId: string,
    filtros: LibroDiarioFiltros,
  ): Promise<ComprobanteLibroDiarioRow[]>;
}
