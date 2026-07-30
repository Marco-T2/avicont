import type { ListarVentasParams } from '@/types/api';

export const PAGE_SIZE = 50;

/**
 * Mapea el estado local de filtros del listado a los query params de
 * GET /api/ventas. Filtro vacío → param OMITIDO (el backend no acepta '').
 */
export function buildVentasParams(
  contactoId: string | null,
  fechaDesde: string,
  fechaHasta: string,
  page: number,
): ListarVentasParams {
  return {
    ...(contactoId !== null ? { contactoId } : {}),
    ...(fechaDesde !== '' ? { fechaDesde } : {}),
    ...(fechaHasta !== '' ? { fechaHasta } : {}),
    page,
    pageSize: PAGE_SIZE,
  };
}
