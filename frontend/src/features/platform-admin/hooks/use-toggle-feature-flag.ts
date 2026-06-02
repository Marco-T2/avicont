import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';

import { toggleFeatureFlag } from '../api/toggle-feature-flag';

/**
 * Alterna el estado `enabled` de un feature flag global (super-admin).
 *
 * Estrategia on-success refresh (no optimista): invalida ['feature-flags-global']
 * para re-leer la verdad del backend. onError: toast.error. Anti-F-13: el toast
 * vive en el hook, no en el cuerpo del componente.
 */
export function useToggleFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => toggleFeatureFlag(key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags-global'] });
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo cambiar el estado de la feature flag'));
    },
  });
}
