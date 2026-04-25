// Port DEFINIDO por tipos-documento-fisico (dueño del catálogo, §3.7
// CLAUDE.md) para lecturas cross-módulo. Lo consume `documentos-fisicos`
// para validar que el `tipoDocumentoFisicoId` referenciado existe, está
// activo y es del tenant — y para verificar la regla de monto condicional
// (REQ-D-13/14) sin un segundo query.
//
// Superficie mínima: campos que el documentos-fisicos.service necesita al
// crear/editar. NO expone `nombre`, `createdAt`, etc. — blast radius acotado.

import type { Prisma, TipoComprobante } from '@prisma/client';

export const TIPOS_DOCUMENTO_FISICO_READER_PORT = Symbol(
  'TIPOS_DOCUMENTO_FISICO_READER_PORT',
);

export interface TipoDocumentoFisicoParaValidacion {
  id: string;
  codigo: string;
  esTributario: boolean;
  activo: boolean;
  /**
   * Incluido para que documentos-fisicos.service pueda validar la regla de
   * monto condicional (REQ-D-13/14) sin un segundo query, y también para
   * exponerlo en el shape `DocumentoFisicoParaAsociar` del reader cross-
   * módulo de documentos-fisicos (proposal D11).
   */
  tiposComprobanteAplicables: TipoComprobante[];
}

export abstract class TiposDocumentoFisicoReaderPort {
  /**
   * Lee un tipo por id, scopeado al tenant. Devuelve null si no existe o
   * pertenece a otro tenant (multi-tenancy defense in depth — CLAUDE.md §4.2).
   *
   * Acepta opcionalmente un `tx` de Prisma para que la lectura participe de
   * la misma transacción que el write del documento físico — importante al
   * crear/editar, para aislarse contra una desactivación concurrente del tipo.
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisicoParaValidacion | null>;
}
