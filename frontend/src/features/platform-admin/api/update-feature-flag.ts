import { api } from '@/lib/api';
import type { FeatureFlag, UpdateFeatureFlagRequest } from '@/types/api';

/**
 * PUT /api/admin/feature-flags/:key — actualiza un feature flag global (name,
 * description, enabled, metadata). La `key` es inmutable (identifica el recurso).
 * 404 FEATURE_FLAG_NO_ENCONTRADA si la key no existe.
 */
export async function updateFeatureFlag(
  key: string,
  body: UpdateFeatureFlagRequest,
): Promise<FeatureFlag> {
  const res = await api.put<FeatureFlag>(
    `/api/admin/feature-flags/${encodeURIComponent(key)}`,
    body,
  );
  return res.data;
}
