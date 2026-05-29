import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarTiposDocumentoFisicoParams } from '@/types/api';

import { getTiposDocumentoFisico } from '../api/get-tipos-documento-fisico';

// keepPreviousData: al cambiar filtros/página la UI no parpadea en vacío —
// muestra la data anterior con un skeleton sutil hasta que llega la nueva.
export function useTiposDocumentoFisico(params: ListarTiposDocumentoFisicoParams = {}) {
  return useQuery({
    queryKey: ['tipos-documento-fisico', params],
    queryFn: () => getTiposDocumentoFisico(params),
    placeholderData: keepPreviousData,
  });
}
