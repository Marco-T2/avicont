import { useQuery } from '@tanstack/react-query';

import { getEstadoResultados } from '../api/get-estado-resultados';
import type { EstadoResultadosFiltroValues } from '../schemas/estado-resultados-filtro-schema';

// ============================================================
// Hook del Estado de Resultados
// ============================================================

/**
 * Hook del Estado de Resultados (TanStack Query).
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useEstadoResultados(filtros: EstadoResultadosFiltroValues | null) {
  return useQuery({
    queryKey: ['estado-resultados', filtros],
    queryFn: () => getEstadoResultados(filtros as EstadoResultadosFiltroValues),
    enabled: filtros !== null,
  });
}
