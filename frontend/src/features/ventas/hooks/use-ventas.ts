import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarVentasParams } from '@/types/api';

import { getVentas } from '../api/get-ventas';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío —
// muestra la data anterior hasta que llega la nueva.
export function useVentas(params: ListarVentasParams = {}) {
  return useQuery({
    queryKey: ['ventas', params],
    queryFn: () => getVentas(params),
    placeholderData: keepPreviousData,
  });
}
