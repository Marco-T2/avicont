import type { ListarTiposDocumentoFisicoParams, TipoComprobante } from '@/types/api';

export const PAGE_SIZE = 50;

export type EstadoFiltro = 'activos' | 'inactivos' | 'todos';

/**
 * Mapea el estado local de filtros de la página al objeto de params
 * que acepta useTiposDocumentoFisico / getTiposDocumentoFisico.
 *
 * Reglas:
 * - estado='activos'   → activo se OMITE (backend default = solo activos)
 * - estado='inactivos' → activo: false
 * - estado='todos'     → activo: 'all'
 * - q vacío → q se OMITE
 */
export function buildTiposDocumentoFisicoParams(
  estado: EstadoFiltro,
  q: string,
  page: number,
): ListarTiposDocumentoFisicoParams {
  return {
    ...(estado === 'inactivos' ? { activo: false } : {}),
    ...(estado === 'todos' ? { activo: 'all' as const } : {}),
    ...(q.length > 0 ? { q } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
}

// Mapa value ↔ label para los 7 valores de TipoComprobante.
// Usado en el checkbox group del form y en los badges de la tabla.
export const TIPO_COMPROBANTE_OPTIONS: { value: TipoComprobante; label: string }[] = [
  { value: 'APERTURA', label: 'Apertura' },
  { value: 'DIARIO', label: 'Diario' },
  { value: 'INGRESO', label: 'Ingreso' },
  { value: 'EGRESO', label: 'Egreso' },
  { value: 'AJUSTE', label: 'Ajuste / reversión' },
  { value: 'TRASPASO', label: 'Traspaso' },
  { value: 'CIERRE', label: 'Cierre' },
];
