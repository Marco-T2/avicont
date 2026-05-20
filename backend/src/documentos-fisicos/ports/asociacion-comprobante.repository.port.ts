// Puerto interno del repositorio de asociación `ComprobanteDocumentoFisico`.
// Vive dentro de `documentos-fisicos` porque es el módulo dueño de la
// asociación (CLAUDE.md §3.7 — owner-owned). Multi-tenancy defense in
// depth: TODA query del adapter filtra por tenantId.

import type { ComprobanteDocumentoFisico, EstadoComprobante, Prisma } from '@prisma/client';

export const ASOCIACION_COMPROBANTE_REPOSITORY_PORT = Symbol(
  'ASOCIACION_COMPROBANTE_REPOSITORY_PORT',
);

// ============================================================
// Tipos de datos aceptados por el repo
// ============================================================

export interface AsociarInput {
  comprobanteId: string;
  documentoFisicoId: string;
  /**
   * Cache denormalizado del estado del comprobante en la fila de
   * asociación. Habilita el UNIQUE PARCIAL del UNIQUE
   * `comprobante_documento_fisico_unique_contabilizado`
   * (CLAUDE.md §11.6 raw SQL drift).
   */
  comprobanteEstado: EstadoComprobante;
}

// ============================================================
// Port
// ============================================================

export abstract class AsociacionComprobanteRepositoryPort {
  /**
   * Inserta una fila de asociación. El service pre-validó existencia
   * y pertenencia al tenant del comprobante y del documento físico.
   * Si el UNIQUE PARCIAL revienta por race (cicatriz F-01, CLAUDE.md §4.8),
   * el adapter captura el `P2002` y lo mapea al `DomainError` de dominio.
   */
  abstract asociar(
    tenantId: string,
    input: AsociarInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico>;

  /**
   * Borra UNA asociación específica. Devuelve la cantidad de filas
   * afectadas (0 si no existía, 1 si se borró).
   */
  abstract desasociar(
    tenantId: string,
    comprobanteId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Borra TODAS las asociaciones de un comprobante. Usado al ANULAR
   * el comprobante: libera los `DocumentoFisico` asociados para
   * re-uso. Se invoca desde `comprobantes.service` en la misma TX
   * que cambia el estado.
   */
  abstract desasociarTodasDelComprobante(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Refresca la columna cache `comprobanteEstado` para todas las filas
   * que asocian el comprobante dado. Se invoca desde
   * `comprobantes.service` en la misma TX que cambia el estado del
   * comprobante (CONTABILIZAR, ANULAR si no se borraron las filas).
   * Devuelve la cantidad de filas actualizadas.
   */
  abstract refrescarEstadoComprobante(
    tenantId: string,
    comprobanteId: string,
    nuevoEstado: EstadoComprobante,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /** Lista todas las asociaciones de un comprobante del tenant. */
  abstract listarPorComprobante(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico[]>;

  /** Lista todas las asociaciones de un documento físico del tenant. */
  abstract listarPorDocumento(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteDocumentoFisico[]>;
}
