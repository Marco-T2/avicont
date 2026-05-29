import { useMutation, useQueryClient } from '@tanstack/react-query';

import { asociarDocumentos } from '../api/asociar-documentos';

/**
 * Mutation para asociar documentos físicos a un comprobante (POST).
 * Invalida ['comprobantes','documentos-fisicos',id] + ['documentos-fisicos'] en onSuccess (D7).
 * Sin onError propio — la sección manejadora dispara el toast (Anti-F-13).
 */
export function useAsociarDocumentos(comprobanteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentoFisicoIds: string[]) =>
      asociarDocumentos(comprobanteId, documentoFisicoIds),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['comprobantes', 'documentos-fisicos', comprobanteId],
      });
      void qc.invalidateQueries({ queryKey: ['documentos-fisicos'] });
    },
  });
}
