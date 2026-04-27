// Puerto interno del repositorio del módulo `documentos-fisicos`.
// Expone la superficie de persistencia para que el servicio nunca toque
// Prisma directamente (Anti-31 CLAUDE.md §8.1). Multi-tenancy defense in
// depth (CLAUDE.md §4.2): TODA query del adapter filtra por tenantId.

import type { DocumentoFisico, Moneda, Prisma } from '@prisma/client';

export const DOCUMENTO_FISICO_REPOSITORY_PORT = Symbol(
  'DOCUMENTO_FISICO_REPOSITORY_PORT',
);

// ============================================================
// Tipos de datos aceptados por el repo
// ============================================================

export interface DocumentoFisicoCreateData {
  tipoDocumentoFisicoId: string;
  /** Ya normalizado por el service (trim + uppercase). */
  numero: string;
  /** `FechaContable` mapeada a `@db.Date` en Postgres. */
  fechaEmision: Date;
  /**
   * Nullable por Decisión 4 (proposal). Para tipos `esTributario=true` el
   * service exige valor; para no-tributarios asigna `null` y el monto
   * se toma del `Comprobante` al asociar (single source of truth).
   */
  monto: Prisma.Decimal | null;
  moneda: Moneda | null;
  glosa: string | null;
  contactoId: string | null;
  createdByUserId: string;
}

/**
 * PATCH parcial. `exactOptionalPropertyTypes` activo en el repo
 * (CLAUDE.md §2.5.1) — el adapter aplica spread condicional para
 * distinguir "no tocar" de "setear a null".
 */
export interface DocumentoFisicoUpdateData {
  tipoDocumentoFisicoId?: string;
  numero?: string;
  fechaEmision?: Date;
  monto?: Prisma.Decimal | null;
  moneda?: Moneda | null;
  glosa?: string | null;
  contactoId?: string | null;
}

export interface DocumentoFisicoListarFiltros {
  tipoDocumentoFisicoId?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
  contactoId?: string;
  /** Búsqueda parcial sobre `numero` (uppercase). */
  q?: string;
  /**
   * Filtro por estado derivado:
   *   - `'libre'`         → no asociado a ningún comprobante.
   *   - `'asociado'`      → asociado a >=1 comprobante en cualquier estado.
   *   - `'contabilizado'` → asociado a >=1 comprobante CONTABILIZADO.
   *
   * Implementado vía sub-query EXISTS sobre `ComprobanteDocumentoFisico`.
   */
  estado?: 'libre' | 'asociado' | 'contabilizado';
}

export interface DocumentoFisicoListarPagination {
  page: number;
  limit: number;
  orderBy?: 'fechaEmision' | 'createdAt' | 'numero';
  orderDir?: 'asc' | 'desc';
}

// ============================================================
// Port
// ============================================================

export abstract class DocumentoFisicoRepositoryPort {
  /**
   * Crea un documento físico nuevo. El service pre-validó unicidad de
   * `(tenantId, tipoDocumentoFisicoId, numero)` y la obligatoriedad de
   * `monto`/`moneda` para tipos tributarios (Decisión 4).
   */
  abstract create(
    tenantId: string,
    data: DocumentoFisicoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico>;

  /**
   * Lee un documento del tenant. Retorna `null` si no existe o pertenece
   * a otro tenant (multi-tenancy defense in depth — CLAUDE.md §4.2).
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico | null>;

  /**
   * Busca por `(tenant, tipoDocumentoFisicoId, numero)`. Usado para el
   * check de unicidad pre-create que produce un error amigable antes
   * del UNIQUE en BD (cicatriz F-01, CLAUDE.md §4.8).
   */
  abstract findByNumero(
    tenantId: string,
    tipoDocumentoFisicoId: string,
    numero: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico | null>;

  /**
   * Lista paginada con filtros y orden configurable. Pagination
   * obligatoria (Anti-28). Orden por defecto se lo pasa el caller
   * según REQ-D listado.
   */
  abstract listar(
    tenantId: string,
    filtros: DocumentoFisicoListarFiltros,
    pagination: DocumentoFisicoListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: DocumentoFisico[]; total: number }>;

  /**
   * Aplica un PATCH sobre un documento. Sólo toca los campos presentes.
   * El service ya validó que el documento no esté asociado a un
   * comprobante CONTABILIZADO (>0 ⇒ inmutable).
   */
  abstract update(
    tenantId: string,
    id: string,
    data: DocumentoFisicoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico>;

  /**
   * DELETE físico — el caller verificó con `countAsociaciones` que no
   * queda ninguna asociación. Devuelve la cantidad de filas afectadas
   * (0 ó 1).
   */
  abstract eliminar(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Total de filas en `ComprobanteDocumentoFisico` para el documento
   * (cualquier estado del comprobante). >0 ⇒ no eliminable.
   */
  abstract countAsociaciones(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Cuenta asociaciones a comprobantes en estado CONTABILIZADO. Usado
   * por el service para decidir si un PATCH es válido (>0 ⇒ inmutable).
   */
  abstract countAsociacionesContabilizadas(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
