import { useQuery } from '@tanstack/react-query';

import type { ListarGestionesParams } from '@/types/api';

import { getGestiones } from '../api/get-gestiones';

export function useGestiones(params: ListarGestionesParams = {}) {
  return useQuery({
    queryKey: ['periodos-fiscales', 'gestiones', params],
    queryFn: () => getGestiones(params),
  });
}
