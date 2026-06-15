import { useQuery } from '@tanstack/react-query';

import { getHojaTrabajo } from '../api/get-hoja-trabajo';
import type { HojaTrabajoFiltroValues } from '../schemas/hoja-trabajo-filtro-schema';

// ============================================================
// Hook de la Hoja de Trabajo de 12 columnas
// ============================================================

/**
 * Hook de la Hoja de Trabajo de 12 columnas (TanStack Query).
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useHojaTrabajo(filtros: HojaTrabajoFiltroValues | null) {
  return useQuery({
    queryKey: ['hoja-trabajo', filtros],
    queryFn: () => getHojaTrabajo(filtros as HojaTrabajoFiltroValues),
    enabled: filtros !== null,
  });
}
