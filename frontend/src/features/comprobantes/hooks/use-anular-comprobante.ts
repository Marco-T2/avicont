import { useMutation, useQueryClient } from '@tanstack/react-query';

import { anularComprobante } from '../api/anular-comprobante';

export function useAnularComprobante(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (motivo: string) => anularComprobante(id, motivo),
    onSuccess: () => {
      // Invalidar lista + detalle + auditoría (anulación genera entrada de auditoría).
      void qc.invalidateQueries({ queryKey: ['comprobantes'] });
      void qc.invalidateQueries({ queryKey: ['comprobantes', 'auditoria', id] });
    },
  });
}
