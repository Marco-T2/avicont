import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarItemsParams } from '@/types/api';

import { getItems } from '../api/get-items';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío —
// muestra la data anterior hasta que llega la nueva.
export function useItems(params: ListarItemsParams = {}) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => getItems(params),
    placeholderData: keepPreviousData,
  });
}
