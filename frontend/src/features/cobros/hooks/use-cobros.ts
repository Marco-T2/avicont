import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarCobrosParams } from '@/types/api';

import { getCobros } from '../api/get-cobros';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío.
export function useCobros(params: ListarCobrosParams = {}) {
  return useQuery({
    queryKey: ['cobros', params],
    queryFn: () => getCobros(params),
    placeholderData: keepPreviousData,
  });
}
