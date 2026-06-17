import { useMutation, useQueryClient } from '@tanstack/react-query';

import { generarCierre } from '../api/generar-cierre';

export function useGenerarCierre(gestionId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => generarCierre(gestionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cierre-ejercicio', gestionId] });
    },
  });
}
