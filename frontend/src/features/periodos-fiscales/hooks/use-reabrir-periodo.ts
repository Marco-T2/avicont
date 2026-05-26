import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ReabrirPeriodoRequest } from '@/types/api';

import { reabrirPeriodo } from '../api/reabrir-periodo';

export function useReabrirPeriodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ReabrirPeriodoRequest) =>
      reabrirPeriodo(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['periodos-fiscales'] });
    },
  });
}
