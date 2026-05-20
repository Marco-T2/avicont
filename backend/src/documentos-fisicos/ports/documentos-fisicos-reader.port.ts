// Puerto cross-module del módulo `documentos-fisicos`. Owner-owned
// (CLAUDE.md §3.7): el módulo dueño define qué se puede leer de él.
// Consumido por `comprobantes.service` para validar al asociar y al
// contabilizar. Inspirado en `ContactosReaderPort.obtenerBatch`
// (Fase 1.4 slice 1).

import type { Moneda, Prisma, TipoComprobante } from '@prisma/client';

export const DOCUMENTOS_FISICOS_READER_PORT = Symbol('DOCUMENTOS_FISICOS_READER_PORT');

// ============================================================
// Shape proyectado al consumer (subset de DocumentoFisico + tipo)
// ============================================================

/**
 * Proyección que recibe `comprobantes.service` al asociar un documento
 * físico. Incluye `esTributario` y `tiposComprobanteAplicables`
 * denormalizados desde `TipoDocumentoFisico` (proposal Decisión 11)
 * para que la validación de compatibilidad de tipo no exija un
 * segundo query.
 */
export interface DocumentoFisicoParaAsociar {
  id: string;
  numero: string;
  tipoDocumentoFisicoId: string;
  /** Denormalizado desde el tipo. */
  esTributario: boolean;
  fechaEmision: Date;
  /** Nullable — Decisión 4 actualizada (proposal). */
  monto: Prisma.Decimal | null;
  /** Nullable — Decisión 4 actualizada (proposal). */
  moneda: Moneda | null;
  contactoId: string | null;
  /**
   * Matriz de compatibilidad del tipo. El service de comprobantes
   * verifica que `comprobante.tipo` esté incluido (Decisión 11) antes
   * de insertar la asociación.
   */
  tiposComprobanteAplicables: TipoComprobante[];
}

// ============================================================
// Port
// ============================================================

export abstract class DocumentosFisicosReaderPort {
  /**
   * Lee un lote por ids, scopeado al tenant. El service de comprobantes
   * lo usa al asociar documentos físicos
   * (`POST /comprobantes/:id/documentos-fisicos`) para verificar:
   *   1. Existencia y pertenencia al tenant.
   *   2. Compatibilidad de tipo (`tiposComprobanteAplicables` vs
   *      `comprobante.tipo` — Decisión 11).
   *
   * Los ids ausentes del Map son inexistentes o de otro tenant
   * (defense in depth, CLAUDE.md §4.2). Acepta `tx?` para participar
   * de la TX del contabilizar.
   */
  abstract obtenerBatchParaAsociar(
    tenantId: string,
    documentoFisicoIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, DocumentoFisicoParaAsociar>>;

  /**
   * Devuelve los ids del lote que ya están asociados a OTRO comprobante
   * en estado CONTABILIZADO (excluyendo `excluyendoComprobanteId`). El
   * service de comprobantes lo usa pre-INSERT para fallar fast con un
   * error claro antes de chocar contra el UNIQUE PARCIAL en BD.
   *
   * Defense in depth (CLAUDE.md §4.8): el UNIQUE en BD es la última
   * línea; este método mejora la UX. Aún con esta pre-validación, el
   * INSERT puede fallar por race — el adapter mapea el `P2002` al
   * mismo error de dominio.
   */
  abstract idsYaAsociadosAContabilizado(
    tenantId: string,
    documentoFisicoIds: string[],
    excluyendoComprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]>;
}
