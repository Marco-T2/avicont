import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarCuentasBancariasParams } from '@/types/api';

import { getCuentasBancarias } from '../api/get-cuentas-bancarias';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío.
export function useCuentasBancarias(params: ListarCuentasBancariasParams = {}) {
  return useQuery({
    queryKey: ['cuentas-bancarias', params],
    queryFn: () => getCuentasBancarias(params),
    placeholderData: keepPreviousData,
  });
}
