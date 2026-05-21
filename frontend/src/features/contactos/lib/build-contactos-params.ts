import type { ListarContactosParams } from '@/types/api';

import type { RolFiltro } from '../components/contacto-list-filters';

const PAGE_SIZE = 25;

/**
 * Mapea el estado local de filtros de la página al objeto de params
 * que acepta useContactos / getContactos.
 *
 * Reglas críticas (R2):
 * - rol='clientes'    → esCliente: true  (esProveedor se omite)
 * - rol='proveedores' → esProveedor: true (esCliente se omite)
 * - rol='todos'       → ni esCliente ni esProveedor se mandan
 * - incluirInactivos=true  → activo: 'all'
 * - incluirInactivos=false → activo se OMITE (backend default = solo activos)
 * - q vacío → q se OMITE
 */
export function buildContactosParams(
  rol: RolFiltro,
  incluirInactivos: boolean,
  q: string,
  page: number,
): ListarContactosParams {
  return {
    ...(rol === 'clientes' ? { esCliente: true } : {}),
    ...(rol === 'proveedores' ? { esProveedor: true } : {}),
    ...(incluirInactivos ? { activo: 'all' as const } : {}),
    ...(q.length > 0 ? { q } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
}

export { PAGE_SIZE };
