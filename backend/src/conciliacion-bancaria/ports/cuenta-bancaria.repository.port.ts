// Puerto interno del repositorio de `CuentaBancaria`. Expone la superficie de
// persistencia para que el servicio nunca toque Prisma directamente
// (Anti-31, CLAUDE.md §8.1). Multi-tenancy defense in depth (CLAUDE.md §4.2):
// TODA query del adapter filtra por tenantId.

import type { CuentaBancaria, Moneda, PerfilExtracto, Prisma } from '@prisma/client';

export const CUENTA_BANCARIA_REPOSITORY_PORT = Symbol('CUENTA_BANCARIA_REPOSITORY_PORT');

// ============================================================
// Tipos de datos aceptados por el repo
// ============================================================

export interface CuentaBancariaCreateData {
  cuentaId: string;
  alias: string;
  perfilExtracto: PerfilExtracto;
  /** Nullable — REQ-CB-16: se puede crear sin número y capturarlo en la primera importación. */
  numeroCuenta: string | null;
  moneda: Moneda;
}

/**
 * Campos editables de la cuenta bancaria. `cuentaId` y `perfilExtracto` NO
 * son editables post-create — cambiar el vínculo o el perfil de una cuenta
 * con movimientos/importaciones ya asociados rompería la trazabilidad del
 * histórico (decisión 10, "una cuenta bancaria = un perfil de formato").
 */
export interface CuentaBancariaUpdateData {
  alias?: string;
  numeroCuenta?: string | null;
  moneda?: Moneda;
  activa?: boolean;
}

export interface ListarCuentasBancariasFiltros {
  activa?: boolean | 'all';
}

export interface ListarCuentasBancariasPagination {
  page: number;
  limit: number;
}

// ============================================================
// Port
// ============================================================

export abstract class CuentaBancariaRepositoryPort {
  /** Crea una cuenta bancaria. El caller pre-valida REQ-CB-01/REQ-CB-02. */
  abstract create(
    tenantId: string,
    data: CuentaBancariaCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria>;

  /**
   * Lee una cuenta bancaria del tenant. Retorna null si no existe o
   * pertenece a otro tenant (multi-tenancy defense in depth, REQ-CB-13).
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria | null>;

  /**
   * Busca por (tenant, cuentaId). Usada para el check de unicidad pre-create
   * de REQ-CB-01 (`@@unique([organizationId, cuentaId])`) que produce un
   * error amigable antes del UNIQUE en BD (cicatriz F-01, CLAUDE.md §4.8).
   */
  abstract findByCuentaId(
    tenantId: string,
    cuentaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria | null>;

  /**
   * Busca por (tenant, perfilExtracto, numeroCuenta). Usada para el check de
   * unicidad pre-create/update de CRITICAL-5
   * (`@@unique([organizationId, perfilExtracto, numeroCuenta])`).
   * `excludeId` permite excluir la propia fila en un update.
   */
  abstract findByPerfilYNumero(
    tenantId: string,
    perfilExtracto: PerfilExtracto,
    numeroCuenta: string,
    excludeId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria | null>;

  /** Lista paginada con filtro opcional de `activa`. Orden: alias ASC. */
  abstract listar(
    tenantId: string,
    filtros: ListarCuentasBancariasFiltros,
    pagination: ListarCuentasBancariasPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: CuentaBancaria[]; total: number }>;

  /** Aplica un PATCH sobre una cuenta bancaria. Sólo toca los campos presentes. */
  abstract update(
    tenantId: string,
    id: string,
    data: CuentaBancariaUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria>;

  /**
   * Elimina físicamente una cuenta bancaria. Si tiene movimientos o
   * importaciones asociadas, Postgres bloquea con FK Restrict y el adapter
   * mapea a `CuentaBancariaConMovimientosError` (defense in depth).
   * Devuelve la cantidad de filas afectadas (0 ó 1).
   */
  abstract eliminar(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<number>;
}
