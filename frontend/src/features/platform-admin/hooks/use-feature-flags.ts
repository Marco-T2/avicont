import { useQuery } from '@tanstack/react-query';

import { getFeatureFlags } from '../api/get-feature-flags';

/**
 * Catálogo GLOBAL de feature flags (super-admin).
 *
 * queryKey ['feature-flags-global'] — org-less, no depende del tenant activo.
 * Distinta de las keys de feature flags por tenant. Las mutaciones de PR-4
 * (crear/editar/toggle/eliminar) invalidan esta key.
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags-global'],
    queryFn: getFeatureFlags,
  });
}
