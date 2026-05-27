import { useMutation, useQueryClient } from '@tanstack/react-query';

import { contabilizarComprobante } from '../api/contabilizar-comprobante';

export function useContabilizarComprobante(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => contabilizarComprobante(id),
    onSuccess: () => {
      // Limpia toda la feature: el número correlativo asignado cambia la lista y el detalle.
      void qc.invalidateQueries({ queryKey: ['comprobantes'] });
    },
  });
}
