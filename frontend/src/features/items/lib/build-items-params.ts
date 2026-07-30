import type { ListarItemsParams, TipoItem } from '@/types/api';

export const PAGE_SIZE = 50;

export type TipoFiltro = 'todos' | TipoItem;

export type EstadoFiltro = 'activos' | 'inactivos' | 'todos';

// Mapa value → label para el filtro de tipo y los badges de la tabla.
export const TIPO_ITEM_OPTIONS: { value: TipoItem; label: string }[] = [
  { value: 'PRODUCTO', label: 'Producto' },
  { value: 'SERVICIO', label: 'Servicio' },
];

/**
 * Mapea el estado local de filtros de la página al objeto de params
 * que acepta useItems / getItems.
 *
 * Reglas:
 * - tipo='todos'       → tipo se OMITE
 * - estado='activos'   → activo se OMITE (backend default = solo activos)
 * - estado='inactivos' → activo: false
 * - estado='todos'     → activo: 'all'
 * - q vacío → q se OMITE
 */
export function buildItemsParams(
  tipo: TipoFiltro,
  estado: EstadoFiltro,
  q: string,
  page: number,
): ListarItemsParams {
  return {
    ...(tipo !== 'todos' ? { tipo } : {}),
    ...(estado === 'inactivos' ? { activo: false } : {}),
    ...(estado === 'todos' ? { activo: 'all' as const } : {}),
    ...(q.length > 0 ? { q } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
}
