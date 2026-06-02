import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';

import { deleteFeatureFlag } from '../api/delete-feature-flag';

/**
 * Elimina un feature flag global de forma permanente (super-admin).
 *
 * onSuccess: invalida ['feature-flags-global'] + toast. onError: toast.error con
 * el message del backend (404 FEATURE_FLAG_NO_ENCONTRADA). El AlertDialog lo
 * cierra el caller en su onSuccess. Anti-F-13.
 */
export function useDeleteFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deleteFeatureFlag(key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags-global'] });
      toast.success('Feature flag eliminada');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo eliminar la feature flag'));
    },
  });
}
