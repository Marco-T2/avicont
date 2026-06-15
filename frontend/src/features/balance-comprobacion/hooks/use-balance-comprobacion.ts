import { useQuery } from '@tanstack/react-query';

import { getBalanceComprobacion } from '../api/get-balance-comprobacion';
import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

// ============================================================
// Hook del Balance de Comprobación
// ============================================================

/**
 * Hook del Balance de Comprobación de Sumas y Saldos (TanStack Query).
 *
 * @param filtros - Filtros activos, o null si aún no se consultó.
 *                  Cuando es null, la query queda deshabilitada.
 */
export function useBalanceComprobacion(filtros: BalanceComprobacionFiltroValues | null) {
  return useQuery({
    queryKey: ['balance-comprobacion', filtros],
    queryFn: () => getBalanceComprobacion(filtros as BalanceComprobacionFiltroValues),
    enabled: filtros !== null,
  });
}
