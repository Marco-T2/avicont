import { useMutation, useQueryClient } from '@tanstack/react-query';

import { cerrarGestion } from '../api/cerrar-gestion';

export function useCerrarGestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cerrarGestion(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periodos-fiscales'] });
    },
  });
}
