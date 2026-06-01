// Puerto interno del repositorio de tipos de registro.
// Multi-tenancy defense in depth (CLAUDE.md §4.2): TODA query filtra por
// organizationId.

import type { Prisma } from '@prisma/client';
import type { NaturalezaRegistro } from '../domain/enums';

export const TIPO_REGISTRO_REPOSITORY_PORT = Symbol('TIPO_REGISTRO_REPOSITORY_PORT');

export interface TipoRegistroCreateData {
  nombre: string;
  naturaleza: NaturalezaRegistro;
  esSistema: boolean;
}

export interface TipoRegistroUpdateData {
  nombre?: string;
  activo?: boolean;
}

export interface TipoRegistroRow {
  id: string;
  organizationId: string;
  nombre: string;
  naturaleza: NaturalezaRegistro;
  esSistema: boolean;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TipoRegistroSeedRow {
  nombre: string;
  naturaleza: NaturalezaRegistro;
  esSistema: true;
}

export abstract class TipoRegistroRepositoryPort {
  /** Crea un tipo nuevo. El caller pre-valida unicidad de nombre por org. */
  abstract create(
    organizationId: string,
    data: TipoRegistroCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow>;

  /**
   * Lee un tipo por id, scopeado a la organización.
   * Retorna null si no existe o pertenece a otra org (defense in depth §4.2).
   */
  abstract findById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow | null>;

  /**
   * Busca por (organizationId, nombre) — ancla del seed idempotente y
   * del pre-check de unicidad antes de crear (cicatriz F-01, CLAUDE.md §4.8).
   */
  abstract findByNombre(
    organizationId: string,
    nombre: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow | null>;

  /**
   * Lista tipos del tenant. Incluye fábrica + propios.
   * Orden por defecto: esSistema DESC, nombre ASC.
   */
  abstract listar(
    organizationId: string,
    filtros: { activo?: boolean | 'all'; naturaleza?: NaturalezaRegistro },
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow[]>;

  /**
   * Aplica PATCH sobre un tipo (nombre, activo).
   * No edita naturaleza — inmutable post-creación (CLAUDE.md §3.2 invariante).
   */
  abstract update(
    organizationId: string,
    id: string,
    data: TipoRegistroUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow>;

  /**
   * Elimina físicamente un tipo. El caller DEBE verificar que no tiene
   * movimientos (countMovimientos) y que no es de sistema (esEliminable).
   */
  abstract eliminar(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Cuenta movimientos (inversion + cantidad) asociados al tipo.
   * >0 ⇒ no eliminable (defense in depth + FK Restrict en BD).
   */
  abstract countMovimientos(
    organizationId: string,
    tipoRegistroId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Upsert idempotente por (organizationId, nombre) para el seed inicial.
   * Re-correr es no-op; garantiza que los 12 tipos fábrica siempre estén.
   * Usado por TipoRegistroSeederPort.seedDefaultsForTenant.
   */
  abstract upsertSeed(
    organizationId: string,
    seeds: TipoRegistroSeedRow[],
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
