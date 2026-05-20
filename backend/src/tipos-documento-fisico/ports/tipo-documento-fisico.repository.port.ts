// Puerto interno del repositorio del módulo `tipos-documento-fisico`.
// Expone la superficie de persistencia para que el servicio nunca toque
// Prisma directamente (Anti-31 CLAUDE.md §8.1). Multi-tenancy defense in
// depth (CLAUDE.md §4.2): TODA query del adapter filtra por tenantId.

import type { Prisma, TipoComprobante, TipoDocumentoFisico } from '@prisma/client';

export const TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT = Symbol(
  'TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT',
);

// ============================================================
// Tipos de datos aceptados por el repo
// ============================================================

export interface TipoDocumentoFisicoCreateData {
  nombre: string;
  codigo: string;
  esTributario: boolean;
  tiposComprobanteAplicables: TipoComprobante[];
  /** Nullable porque el seed corre sin user context. */
  createdByUserId: string | null;
}

/**
 * Campos editables del tipo. `codigo` NO es editable — es estable post-create
 * (es el ancla del seed y de queries cross-módulo). Si emerge el caso, se
 * relaja después.
 */
export interface TipoDocumentoFisicoUpdateData {
  nombre?: string;
  esTributario?: boolean;
  tiposComprobanteAplicables?: TipoComprobante[];
}

/**
 * Fila del seed inicial. Incluye `tiposComprobanteAplicables` (proposal D11)
 * para que el upsert siembre la matriz de compatibilidad de cada tipo
 * universal. Ver design §D3 para la tabla exacta.
 */
export interface TipoDocumentoFisicoSeedRow {
  codigo: string;
  nombre: string;
  esTributario: boolean;
  tiposComprobanteAplicables: TipoComprobante[];
}

// ============================================================
// Port
// ============================================================

export abstract class TipoDocumentoFisicoRepositoryPort {
  /** Crea un tipo nuevo. El caller pre-valida unicidad de codigo y nombre. */
  abstract create(
    tenantId: string,
    data: TipoDocumentoFisicoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico>;

  /**
   * Lee un tipo del tenant. Retorna null si no existe o pertenece a otro
   * tenant (multi-tenancy defense in depth — CLAUDE.md §4.2).
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico | null>;

  /**
   * Busca por (tenant, codigo). Usada para el check de unicidad pre-create
   * que produce un error amigable antes del UNIQUE en BD (cicatriz F-01,
   * CLAUDE.md §4.8).
   */
  abstract findByCodigo(
    tenantId: string,
    codigo: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico | null>;

  /**
   * Lista paginada con filtros activo + búsqueda parcial sobre nombre.
   * Pagination obligatoria (Anti-28). Orden por defecto:
   * `esTributario DESC, nombre ASC` (REQ-T-09) — pasado por el caller vía
   * la implementación del adapter.
   */
  abstract listar(
    tenantId: string,
    filtros: { activo?: boolean | 'all'; q?: string },
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: TipoDocumentoFisico[]; total: number }>;

  /**
   * Aplica un PATCH sobre un tipo. Sólo toca los campos presentes.
   * No edita `codigo` (no figura en `TipoDocumentoFisicoUpdateData`).
   */
  abstract update(
    tenantId: string,
    id: string,
    data: TipoDocumentoFisicoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico>;

  /**
   * Cambia el flag `activo`. Separado de `update()` para que el toggle sea
   * siempre explícito en el service y no se cuele vía edición genérica.
   */
  abstract setActivo(
    tenantId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico>;

  /**
   * Cuenta documentos físicos asociados al tipo. >0 ⇒ no eliminable.
   * Defense in depth contra la FK Restrict (CLAUDE.md §4.8).
   */
  abstract countDocumentosFisicos(
    tenantId: string,
    tipoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Elimina físicamente un tipo. El caller DEBE haber verificado con
   * `countDocumentosFisicos` que no queda ningún documento apuntando — si
   * queda, Postgres bloquea con FK Restrict y la operación falla.
   * Devuelve la cantidad de filas afectadas (0 ó 1).
   */
  abstract eliminar(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<number>;

  /**
   * Upsert idempotente para el seed inicial. Ejecuta `upsert` por
   * `(organizationId, codigo)` — re-correr es no-op si ya existen, o
   * actualiza `tiposComprobanteAplicables`/`nombre`/`esTributario` si la
   * matriz cambió. Usado por `TipoDocumentoFisicoSeederPort.seedDefaultsForTenant`.
   */
  abstract upsertSeed(
    tenantId: string,
    seeds: TipoDocumentoFisicoSeedRow[],
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
