import { useQuery } from '@tanstack/react-query';

import { getDocumentosAsociados } from '../api/get-documentos-asociados';

/**
 * Query de documentos físicos asociados a un comprobante.
 * Query key: ['comprobantes','documentos-fisicos', comprobanteId] (D7).
 */
export function useDocumentosAsociados(comprobanteId: string) {
  return useQuery({
    queryKey: ['comprobantes', 'documentos-fisicos', comprobanteId],
    queryFn: () => getDocumentosAsociados(comprobanteId),
    enabled: comprobanteId !== '',
  });
}
