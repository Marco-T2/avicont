import { useQuery } from '@tanstack/react-query';

import { getAdjuntos } from '../api/adjuntos-comprobante';

/**
 * Query de adjuntos de un comprobante.
 * Query key: ['comprobantes', 'adjuntos', comprobanteId]
 */
export function useAdjuntos(comprobanteId: string) {
  return useQuery({
    queryKey: ['comprobantes', 'adjuntos', comprobanteId],
    queryFn: () => getAdjuntos(comprobanteId),
    enabled: comprobanteId !== '',
  });
}
