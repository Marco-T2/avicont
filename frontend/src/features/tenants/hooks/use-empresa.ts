import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getEmpresa } from '../api/get-empresa';
import { updateEmpresa } from '../api/update-empresa';
import type { EmpresaFormValues } from '../schemas/empresa-form-schema';

// queryKey dedicada — no colisiona con ['me'], ['me-permissions'] ni ['memberships'].
export const EMPRESA_QUERY_KEY = ['tenant', 'empresa'] as const;

export function useEmpresa() {
  return useQuery({
    queryKey: EMPRESA_QUERY_KEY,
    queryFn: getEmpresa,
  });
}

export function useUpdateEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: EmpresaFormValues) => updateEmpresa(data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EMPRESA_QUERY_KEY });
    },
  });
}
