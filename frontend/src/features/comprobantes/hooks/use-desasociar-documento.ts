import { useMutation, useQueryClient } from '@tanstack/react-query';

import { desasociarDocumento } from '../api/desasociar-documento';

/**
 * Mutation para desasociar un documento físico de un comprobante (DELETE 204).
 * Invalida ['comprobantes','documentos-fisicos',id] + ['documentos-fisicos'] en onSuccess (D7).
 * Sin onError propio — la sección manejadora dispara el toast (Anti-F-13).
 */
export function useDesasociarDocumento(comprobanteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentoFisicoId: string) =>
      desasociarDocumento(comprobanteId, documentoFisicoId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['comprobantes', 'documentos-fisicos', comprobanteId],
      });
      void qc.invalidateQueries({ queryKey: ['documentos-fisicos'] });
    },
  });
}
