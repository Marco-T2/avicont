import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import type { GestionConPeriodos } from '@/types/api';

import { getGestionDetalle } from '../api/get-gestion-detalle';

export function useGestionDetalle(
  id: string | undefined,
  opts?: Omit<
    UseQueryOptions<GestionConPeriodos>,
    'queryKey' | 'queryFn' | 'enabled'
  >,
) {
  return useQuery({
    ...opts,
    queryKey: ['periodos-fiscales', 'gestion', id],
    queryFn: () => getGestionDetalle(id!),
    enabled: !!id,
  });
}
