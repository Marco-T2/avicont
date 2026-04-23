import { api } from '@/lib/api';
import type {
  CreateFeatureFlagOverrideRequest,
  FeatureFlag,
  UpdateFeatureFlagOverrideRequest,
} from '@/types/api';

// POST /api/feature-flags/overrides — crea override del tenant.
export async function createFeatureFlagOverride(
  body: CreateFeatureFlagOverrideRequest,
): Promise<FeatureFlag> {
  const res = await api.post<FeatureFlag>(
    '/api/feature-flags/overrides',
    body,
  );
  return res.data;
}

// PUT /api/feature-flags/overrides/:key — actualiza override existente.
export async function updateFeatureFlagOverride(
  key: string,
  body: UpdateFeatureFlagOverrideRequest,
): Promise<FeatureFlag> {
  const res = await api.put<FeatureFlag>(
    `/api/feature-flags/overrides/${key}`,
    body,
  );
  return res.data;
}
