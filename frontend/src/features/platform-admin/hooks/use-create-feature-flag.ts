import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';
import type { CreateFeatureFlagRequest } from '@/types/api';

import { createFeatureFlag } from '../api/create-feature-flag';

/**
 * Crea un feature flag global (super-admin).
 *
 * onSuccess: invalida ['feature-flags-global'] + toast de éxito.
 * onError: toast.error con el message del backend (incluye el 409
 * FEATURE_FLAG_DUPLICADA, ya en español). El Sheet NO se cierra acá — el caller
 * lo cierra en su onSuccess para que en error el form siga abierto. Anti-F-13.
 */
export function useCreateFeatureFlag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFeatureFlagRequest) => createFeatureFlag(body),
    onSuccess: (flag) => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags-global'] });
      toast.success(`Feature flag «${flag.key}» creada`);
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo crear la feature flag'));
    },
  });
}
