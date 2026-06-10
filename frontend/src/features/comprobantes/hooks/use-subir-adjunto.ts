import { useMutation, useQueryClient } from '@tanstack/react-query';

import { subirAdjunto } from '../api/adjuntos-comprobante';

/**
 * Mutation para subir un adjunto a un comprobante.
 * Invalida ['comprobantes','adjuntos', comprobanteId] en onSuccess.
 * Sin onError propio — el componente manejador dispara el toast (Anti-F-13).
 */
export function useSubirAdjunto(comprobanteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => subirAdjunto(comprobanteId, file),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['comprobantes', 'adjuntos', comprobanteId],
      });
    },
  });
}
