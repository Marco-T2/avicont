import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarComprobantesParams } from '@/types/api';

import { getComprobantes } from '../api/get-comprobantes';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío —
// muestra la data anterior hasta que llega la nueva (mismo patrón que useCuentas).
export function useComprobantes(params: ListarComprobantesParams = {}) {
  return useQuery({
    queryKey: ['comprobantes', 'list', params],
    queryFn: () => getComprobantes(params),
    placeholderData: keepPreviousData,
  });
}
