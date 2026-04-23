import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarCuentasParams } from '@/types/api';

import { getCuentas } from '../api/get-cuentas';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío —
// muestra la data anterior con un skeleton sutil hasta que llega la nueva.
export function useCuentas(params: ListarCuentasParams = {}) {
  return useQuery({
    queryKey: ['cuentas', params],
    queryFn: () => getCuentas(params),
    placeholderData: keepPreviousData,
  });
}
