// Puerto del repositorio del módulo `items`. El servicio nunca toca Prisma
// directamente (Anti-31).

import type { Item, Prisma, TipoItem } from '@prisma/client';

export const ITEMS_REPOSITORY_PORT = Symbol('ITEMS_REPOSITORY_PORT');

/**
 * Los montos viajan como `string`, nunca `number` (§4.5): `precioUnitario`
 * es Decimal(18,6) y un float perdería precisión antes de llegar al INSERT.
 *
 * `cantidadPorDefecto: null` = usar el default del schema (1). No se manda 1
 * desde el caller para que el default viva en un solo lugar.
 */
export interface ItemCreateData {
  codigo: string | null;
  nombre: string;
  tipo: TipoItem;
  unidadMedida: string | null;
  precioUnitarioSugerido: string | null;
  cantidadPorDefecto: string | null;
  cuentaIngresoId: string | null;
  createdByUserId: string;
}

/**
 * `undefined` = no tocar; `null` = limpiar. `nombre` y `tipo` no admiten null.
 *
 * `activo` se toca vía `setActivo()` para que el toggle sea explícito en el
 * service y no se cuele por una edición genérica (mismo criterio que
 * contactos).
 */
export interface ItemUpdateData {
  codigo?: string | null;
  nombre?: string;
  tipo?: TipoItem;
  unidadMedida?: string | null;
  precioUnitarioSugerido?: string | null;
  cantidadPorDefecto?: string;
  cuentaIngresoId?: string | null;
}

export interface ItemListarFiltros {
  /** Búsqueda parcial case-insensitive sobre nombre + código. */
  q?: string;
  tipo?: TipoItem;
  /** true (default) → sólo activos. false → sólo inactivos. 'all' → ambos. */
  activo?: boolean | 'all';
}

export interface ItemListarPagination {
  page: number;
  limit: number;
  orderBy?: 'nombre' | 'codigo' | 'createdAt';
  orderDir?: 'asc' | 'desc';
}

export abstract class ItemsRepositoryPort {
  /** Asume que el caller ya normalizó el código y validó unicidad. */
  abstract create(
    tenantId: string,
    data: ItemCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Item>;

  abstract update(
    tenantId: string,
    id: string,
    data: ItemUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Item>;

  /**
   * Cambia el flag `activo`. Los ítems NO se borran físicamente (REQ-ITM-01):
   * las ventas existentes conservan su `itemId` y sus snapshots.
   */
  abstract setActivo(
    tenantId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<Item>;

  /** null si no existe o es de otro tenant (§4.2 — el 404 no revela nada). */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Item | null>;

  /**
   * Busca por (tenant, código) para el pre-check de unicidad que produce el
   * 409 amigable antes de que pegue el UNIQUE PARCIAL.
   *
   * Con `codigo === null` devuelve null SIN consultar: sin código no hay
   * unicidad que chequear. Consultar igual devolvería "el primer ítem sin
   * código" y el guard rechazaría toda alta sin código a partir de la segunda.
   */
  abstract findByCodigo(
    tenantId: string,
    codigo: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<Item | null>;

  /** Paginación obligatoria (Anti-28). */
  abstract listar(
    tenantId: string,
    filtros: ItemListarFiltros,
    pagination: ItemListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: Item[]; total: number }>;
}
