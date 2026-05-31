import { useQuery } from '@tanstack/react-query';

import { getBalanceGeneral } from '../api/get-balance-general';
import type { BalanceGeneralFiltroValues } from '../schemas/balance-general-filtro-schema';

// ============================================================
// Hook del Balance General
// ============================================================

/**
 * Hook del Balance General (TanStack Query).
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useBalanceGeneral(filtros: BalanceGeneralFiltroValues | null) {
  return useQuery({
    queryKey: ['balance-general', filtros],
    queryFn: () => getBalanceGeneral(filtros as BalanceGeneralFiltroValues),
    enabled: filtros !== null,
  });
}
