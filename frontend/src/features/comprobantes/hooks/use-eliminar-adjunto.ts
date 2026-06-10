import { useMutation, useQueryClient } from '@tanstack/react-query';

import { eliminarAdjunto } from '../api/adjuntos-comprobante';

/**
 * Mutation para eliminar un adjunto de un comprobante.
 * Invalida ['comprobantes','adjuntos', comprobanteId] en onSuccess.
 * Sin onError propio — el componente manejador dispara el toast (Anti-F-13).
 */
export function useEliminarAdjunto(comprobanteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adjuntoId: string) => eliminarAdjunto(comprobanteId, adjuntoId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['comprobantes', 'adjuntos', comprobanteId],
      });
    },
  });
}
