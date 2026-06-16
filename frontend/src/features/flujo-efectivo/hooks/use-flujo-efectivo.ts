import { useQuery } from '@tanstack/react-query';

import { getFlujoEfectivo } from '../api/get-flujo-efectivo';
import type { FlujoEfectivoFiltroValues } from '../schemas/flujo-efectivo-filtro-schema';

/**
 * Hook del Estado de Flujo de Efectivo (TanStack Query).
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useFlujoEfectivo(filtros: FlujoEfectivoFiltroValues | null) {
  return useQuery({
    queryKey: ['flujo-efectivo', filtros],
    queryFn: () => getFlujoEfectivo(filtros as FlujoEfectivoFiltroValues),
    enabled: filtros !== null,
  });
}
