import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getHojaTrabajo } from '../api/get-hoja-trabajo';
import type { HojaTrabajoFiltroValues } from '../schemas/hoja-trabajo-filtro-schema';

// ============================================================
// Hook de la Hoja de Trabajo de 12 columnas
// ============================================================

/**
 * Hook de la Hoja de Trabajo de 12 columnas (TanStack Query).
 *
 * Solo dispara la query cuando `params` tiene fechaDesde y fechaHasta no vacíos
 * (truthy check), para no enviar una request sin filtros al cargar la página.
 *
 * `keepPreviousData`: al cambiar filtros la UI no parpadea en vacío,
 * muestra la data anterior hasta que llega la nueva.
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useHojaTrabajo(filtros: HojaTrabajoFiltroValues | null) {
  const enabled = Boolean(filtros?.fechaDesde && filtros?.fechaHasta);

  return useQuery({
    queryKey: ['hoja-trabajo', filtros],
    queryFn: () => getHojaTrabajo(filtros as HojaTrabajoFiltroValues),
    enabled,
    placeholderData: keepPreviousData,
  });
}
