// Puerto interno del repositorio de lotes. El service depende de esta
// abstracción; el adapter Prisma la implementa (S3).
// Multi-tenancy defense in depth (CLAUDE.md §4.2): TODA query filtra por
// organizationId.

import type { Prisma } from '@prisma/client';
import type { EstadoLote } from '../domain/enums';

export const LOTE_REPOSITORY_PORT = Symbol('LOTE_REPOSITORY_PORT');

export interface LoteCreateData {
  cantidadInicial: number;
  fechaIngreso: Date;
  nombre?: string | null;
  detalle?: string | null;
  fechaEstimadaSaca?: Date | null;
  galpon?: string | null;
}

export interface LoteUpdateData {
  nombre?: string | null;
  detalle?: string | null;
  fechaIngreso?: Date;
  fechaEstimadaSaca?: Date | null;
  galpon?: string | null;
}

export interface LoteRow {
  id: string;
  organizationId: string;
  nombre: string | null;
  cantidadInicial: number;
  fechaIngreso: Date;
  fechaEstimadaSaca: Date | null;
  fechaCierre: Date | null;
  galpon: string | null;
  detalle: string | null;
  estado: EstadoLote;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class LoteRepositoryPort {
  /** Crea un nuevo lote en estado ACTIVO. */
  abstract create(
    organizationId: string,
    data: LoteCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow>;

  /**
   * Lee un lote por id, scopeado a la organización.
   * Retorna null si no existe o pertenece a otra org (defense in depth §4.2).
   */
  abstract findById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow | null>;

  /**
   * Lee un lote con SELECT … FOR UPDATE (lock pesimista).
   * Usado en registrarCantidad (S4) para serializar la comprobación
   * avesVivas ≥ 0 bajo concurrencia.
   * DEBE correr dentro de una transacción (tx obligatorio).
   */
  abstract findByIdForUpdate(
    organizationId: string,
    id: string,
    tx: Prisma.TransactionClient,
  ): Promise<LoteRow | null>;

  /**
   * Lista lotes del tenant con filtro opcional de estado.
   * Orden por defecto: fechaIngreso DESC.
   */
  abstract listar(
    organizationId: string,
    filtros: { estado?: EstadoLote },
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: LoteRow[]; total: number }>;

  /** Aplica un PATCH sobre el lote. Solo toca campos presentes. */
  abstract update(
    organizationId: string,
    id: string,
    data: LoteUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow>;

  /**
   * Marca el lote como CERRADO y registra la fechaCierre.
   * El service pre-valida que el lote está ACTIVO antes de llamar aquí.
   */
  abstract cerrar(
    organizationId: string,
    id: string,
    fechaCierre: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow>;
}
