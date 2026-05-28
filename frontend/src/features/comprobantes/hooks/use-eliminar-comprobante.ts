import { useMutation, useQueryClient } from '@tanstack/react-query';

import { eliminarComprobante } from '../api/eliminar-comprobante';

export function useEliminarComprobante(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => eliminarComprobante(id),
    onSuccess: () => {
      // Invalida la lista para que el borrador eliminado desaparezca.
      // La navegación a /comprobantes la hace el caller (componente).
      void qc.invalidateQueries({ queryKey: ['comprobantes'] });
    },
  });
}
