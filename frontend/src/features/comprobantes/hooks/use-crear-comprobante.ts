import { useMutation, useQueryClient } from '@tanstack/react-query';

import { crearComprobante } from '../api/crear-comprobante';
import type { CrearComprobantePayload } from '../api/crear-comprobante';

export function useCrearComprobante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CrearComprobantePayload) => crearComprobante(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comprobantes'] });
    },
  });
}
