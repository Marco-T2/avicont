import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarDocumentosFisicosParams } from '@/types/api';

import { getDocumentosFisicos } from '../api/get-documentos-fisicos';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío.
export function useDocumentosFisicos(params: ListarDocumentosFisicosParams = {}) {
  return useQuery({
    queryKey: ['documentos-fisicos', params],
    queryFn: () => getDocumentosFisicos(params),
    placeholderData: keepPreviousData,
  });
}
