import { useMutation, useQueryClient } from '@tanstack/react-query';

import { reemplazarAdjunto } from '../api/adjuntos-comprobante';

/**
 * Mutation para reemplazar el archivo de un adjunto existente.
 * Invalida ['comprobantes','adjuntos', comprobanteId] en onSuccess.
 * Sin onError propio — el componente manejador dispara el toast (Anti-F-13).
 */
export function useReemplazarAdjunto(comprobanteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adjuntoId, file }: { adjuntoId: string; file: File }) =>
      reemplazarAdjunto(comprobanteId, adjuntoId, file),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['comprobantes', 'adjuntos', comprobanteId],
      });
    },
  });
}
