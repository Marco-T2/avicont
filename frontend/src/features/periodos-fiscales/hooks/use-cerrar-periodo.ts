import { useMutation, useQueryClient } from '@tanstack/react-query';

import { cerrarPeriodo } from '../api/cerrar-periodo';

export function useCerrarPeriodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cerrarPeriodo(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periodos-fiscales'] });
    },
  });
}
