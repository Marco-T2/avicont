import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import type { ResumenPrecierre } from '@/types/api';

import { getResumenPrecierre } from '../api/get-resumen-precierre';

export function useResumenPrecierre(
  id: string | undefined,
  opts?: Omit<
    UseQueryOptions<ResumenPrecierre>,
    'queryKey' | 'queryFn' | 'enabled' | 'gcTime'
  >,
) {
  return useQuery({
    ...opts,
    queryKey: ['periodos-fiscales', 'resumen', id],
    queryFn: () => getResumenPrecierre(id!),
    enabled: !!id,
    // gcTime: 0 — el resumen refleja el estado vivo del período.
    // No queremos datos stale cacheados tras cerrar un drawer y reabrirlo.
    gcTime: 0,
  });
}
