import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getFlujoEfectivo } from '../api/get-flujo-efectivo';
import type { FlujoEfectivoFiltroValues } from '../schemas/flujo-efectivo-filtro-schema';

/**
 * Hook del Estado de Flujo de Efectivo (TanStack Query).
 *
 * Solo dispara la query cuando `filtros` tiene fechaDesde y fechaHasta no vacíos
 * (truthy check), para no enviar una request sin filtros al cargar la página.
 *
 * `keepPreviousData`: al cambiar filtros la UI no parpadea en vacío,
 * muestra la data anterior hasta que llega la nueva.
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 */
export function useFlujoEfectivo(filtros: FlujoEfectivoFiltroValues | null) {
  const enabled = Boolean(filtros?.fechaDesde && filtros?.fechaHasta);

  return useQuery({
    queryKey: ['flujo-efectivo', filtros],
    queryFn: () => getFlujoEfectivo(filtros as FlujoEfectivoFiltroValues),
    enabled,
    placeholderData: keepPreviousData,
  });
}
