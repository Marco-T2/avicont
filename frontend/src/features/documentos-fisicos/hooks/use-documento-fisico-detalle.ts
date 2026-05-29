import { useQuery } from '@tanstack/react-query';

import { getDocumentoFisicoDetalle } from '../api/get-documento-fisico-detalle';

// enabled: id !== null — no fetcha si no hay id seleccionado.
export function useDocumentoFisicoDetalle(id: string | null) {
  return useQuery({
    queryKey: ['documentos-fisicos', 'detalle', id],
    queryFn: () => getDocumentoFisicoDetalle(id as string),
    enabled: id !== null,
  });
}
