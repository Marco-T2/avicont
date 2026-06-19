import { useQuery } from '@tanstack/react-query';

import { getEvolucionPatrimonio } from '../api/get-evolucion-patrimonio';
import type { EvolucionPatrimonioFiltroValues } from '../schemas/evolucion-patrimonio-filtro-schema';

/**
 * Hook del Estado de Evolución del Patrimonio Neto (TanStack Query).
 *
 * Solo dispara la query cuando `filtros` es no-null y tiene fechaDesde +
 * fechaHasta no vacíos. La validación en handleConsultar lo garantiza, pero
 * esta doble guarda protege ante futuros usos del hook fuera del componente.
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 */
export function useEvolucionPatrimonio(filtros: EvolucionPatrimonioFiltroValues | null) {
  return useQuery({
    queryKey: ['evolucion-patrimonio', filtros],
    queryFn: () => getEvolucionPatrimonio(filtros as EvolucionPatrimonioFiltroValues),
    enabled: filtros !== null && Boolean(filtros.fechaDesde && filtros.fechaHasta),
  });
}
