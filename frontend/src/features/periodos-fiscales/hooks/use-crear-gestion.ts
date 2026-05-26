import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CrearGestionRequest } from '@/types/api';

import { crearGestion } from '../api/crear-gestion';

export function useCrearGestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CrearGestionRequest) => crearGestion(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periodos-fiscales'] });
    },
  });
}
