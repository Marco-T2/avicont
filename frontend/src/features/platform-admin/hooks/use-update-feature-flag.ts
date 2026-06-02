import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';
import type { UpdateFeatureFlagRequest } from '@/types/api';

import { updateFeatureFlag } from '../api/update-feature-flag';

interface UpdateFeatureFlagVars {
  key: string;
  body: UpdateFeatureFlagRequest;
}

/**
 * Actualiza un feature flag global (super-admin). La `key` identifica el recurso
 * (inmutable); el body lleva name/description/enabled/metadata.
 *
 * onSuccess: invalida ['feature-flags-global'] + toast. onError: toast.error con
 * el message del backend (404 FEATURE_FLAG_NO_ENCONTRADA). El Sheet lo cierra el
 * caller en su onSuccess. Anti-F-13.
 */
export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: UpdateFeatureFlagVars) => updateFeatureFlag(key, body),
    onSuccess: (flag) => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags-global'] });
      toast.success(`Feature flag «${flag.key}» actualizada`);
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo actualizar la feature flag'));
    },
  });
}
