import { useQuery } from '@tanstack/react-query';

import { getEvolucionPatrimonio } from '../api/get-evolucion-patrimonio';
import type { EvolucionPatrimonioFiltroValues } from '../schemas/evolucion-patrimonio-filtro-schema';

/**
 * Hook del Estado de Evolución del Patrimonio Neto (TanStack Query).
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useEvolucionPatrimonio(filtros: EvolucionPatrimonioFiltroValues | null) {
  return useQuery({
    queryKey: ['evolucion-patrimonio', filtros],
    queryFn: () => getEvolucionPatrimonio(filtros as EvolucionPatrimonioFiltroValues),
    enabled: filtros !== null,
  });
}
