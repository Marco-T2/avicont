// Puerto del repositorio del módulo `contactos`. Expone la superficie
// de persistencia para que el servicio nunca toque Prisma directamente
// (Anti-31 CLAUDE.md §8.1).

import type { Contacto, Prisma } from '@prisma/client';

export const CONTACTOS_REPOSITORY_PORT = Symbol('CONTACTOS_REPOSITORY_PORT');

// ============================================================
// Tipos de datos aceptados por el repo
// ============================================================

export interface ContactoCreateData {
  razonSocial: string;
  nombreComercial: string | null;
  documento: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  createdByUserId: string;
}

/**
 * Campos editables del contacto. `undefined` = no tocar, `null` = limpiar
 * (para campos que aceptan null como documento, email, etc.).
 *
 * `razonSocial` NO admite null — si viene, debe tener contenido válido.
 * `activo` se toca vía `setActivo()` para dejar el toggle explícito en el
 * service y evitar que un update genérico desactive un contacto por
 * accidente.
 */
export interface ContactoUpdateData {
  razonSocial?: string;
  nombreComercial?: string | null;
  documento?: string | null;
  esCliente?: boolean;
  esProveedor?: boolean;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export interface ContactoListarFiltros {
  /** Búsqueda ILIKE parcial sobre razonSocial + nombreComercial (GIN trigram). */
  q?: string;
  /** Match exacto sobre documento. Útil para "¿existe este NIT?". */
  documento?: string;
  esCliente?: boolean;
  esProveedor?: boolean;
  /**
   * true (default) → solo activos.
   * false → solo inactivos.
   * 'all' → ambos (para reports o admin).
   */
  activo?: boolean | 'all';
}

export interface ContactoListarPagination {
  page: number;
  limit: number;
  orderBy?: 'razonSocial' | 'createdAt';
  orderDir?: 'asc' | 'desc';
}

// ============================================================
// Port
// ============================================================

export abstract class ContactosRepositoryPort {
  /** Crea un contacto nuevo. Asume que el caller ya validó invariantes y unicidad. */
  abstract create(
    tenantId: string,
    data: ContactoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto>;

  /**
   * Aplica un PATCH sobre un contacto. Sólo toca los campos presentes.
   * Asume que el caller ya validó invariantes (flags, unicidad de documento).
   */
  abstract update(
    tenantId: string,
    id: string,
    data: ContactoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto>;

  /**
   * Cambia el flag `activo`. Separado de `update()` para que el toggle
   * sea siempre explícito en el service y no se cuele vía edición genérica.
   */
  abstract setActivo(
    tenantId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto>;

  /**
   * Lee un contacto del tenant. Retorna null si no existe o pertenece a
   * otro tenant (multi-tenancy defense in depth — CLAUDE.md §4.2).
   */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto | null>;

  /**
   * Busca un contacto por (tenant, documento). Usada para el check de
   * unicidad pre-create/update que produce un error amigable antes del
   * índice parcial único (cicatriz F-01, CLAUDE.md §4.8).
   *
   * Si `documento` viene null o '', devolvé null sin consultar BD — no
   * hay unicidad sin documento.
   */
  abstract findByDocumento(
    tenantId: string,
    documento: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto | null>;

  /**
   * Lista paginada con filtros. Ordena por `razonSocial` ASC por default.
   * Pagination obligatoria (Anti-28).
   */
  abstract listar(
    tenantId: string,
    filtros: ContactoListarFiltros,
    pagination: ContactoListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: Contacto[]; total: number }>;

  /**
   * Elimina físicamente un contacto. El caller DEBE haber verificado con
   * `countLineasReferenciadoras` que no queda ninguna línea apuntando —
   * si queda, Postgres bloquea con FK Restrict y la operación falla.
   * Devuelve la cantidad de filas afectadas (0 ó 1).
   */
  abstract eliminar(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<number>;

  /**
   * Cuenta líneas de comprobante que referencian este contacto dentro del
   * tenant. 0 ⇒ contacto eliminable. >0 ⇒ hay histórico contable y se
   * debe desactivar en vez de eliminar (§5.4 diseño, §4.7 core).
   */
  abstract countLineasReferenciadoras(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
