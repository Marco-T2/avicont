import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FeatureFlag } from '@/types/api';

import { listFeatureFlags } from '../api/list-feature-flags';
import {
  createFeatureFlagOverride,
  updateFeatureFlagOverride,
} from '../api/set-feature-flag';

export function useFeatureFlagList() {
  return useQuery({
    queryKey: ['feature-flags', 'list'],
    queryFn: listFeatureFlags,
    staleTime: 30_000,
  });
}

interface SetFlagInput {
  flag: FeatureFlag;
  enabled: boolean;
  hasOverride: boolean;
}

// Unifica POST (crear override) y PUT (actualizar override).
// El backend no deja togglear un flag global sin crear primero un override.
export function useSetFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ flag, enabled, hasOverride }: SetFlagInput) => {
      if (hasOverride) {
        return updateFeatureFlagOverride(flag.key, { enabled });
      }
      return createFeatureFlagOverride({
        key: flag.key,
        name: flag.name,
        ...(flag.description !== null
          ? { description: flag.description }
          : {}),
        enabled,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feature-flags'] });
      // Invalidar el cache de permisos para que useVerticalActivo refleje el
      // nuevo vertical inmediatamente sin esperar el staleTime de 5 min.
      // queryKey sin el segundo elemento → invalida todas las entradas ['me-permissions', *].
      void qc.invalidateQueries({ queryKey: ['me-permissions'] });
    },
  });
}
