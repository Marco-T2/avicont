import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getBalanceComprobacion } from '../api/get-balance-comprobacion';
import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

// ============================================================
// Hook del Balance de Comprobación
// ============================================================

/**
 * Hook de TanStack Query para el Balance de Comprobación.
 *
 * Solo dispara la query cuando `params` tiene fechaDesde y fechaHasta no vacíos
 * (truthy check), para no enviar una request sin filtros al cargar la página.
 *
 * `keepPreviousData`: al cambiar filtros la UI no parpadea en vacío,
 * muestra la data anterior hasta que llega la nueva.
 *
 * @param params - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useBalanceComprobacion(params: BalanceComprobacionFiltroValues | null) {
  const enabled = Boolean(params?.fechaDesde && params?.fechaHasta);

  return useQuery({
    queryKey: ['balance-comprobacion', params],
    queryFn: () => getBalanceComprobacion(params as BalanceComprobacionFiltroValues),
    enabled,
    placeholderData: keepPreviousData,
  });
}
