import { useMutation, useQueryClient } from '@tanstack/react-query';

import { editarComprobante } from '../api/editar-comprobante';
import type { EditarComprobantePayload } from '../api/editar-comprobante';

export function useEditarComprobante(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EditarComprobantePayload) => editarComprobante(id, payload),
    onSuccess: () => {
      // Invalidar lista + detalle + auditoría del comprobante editado.
      void qc.invalidateQueries({ queryKey: ['comprobantes'] });
      void qc.invalidateQueries({ queryKey: ['comprobantes', 'auditoria', id] });
    },
  });
}
