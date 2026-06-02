import { api } from '@/lib/api';
import type { ToggleFeatureFlagResponse } from '@/types/api';

/**
 * POST /api/admin/feature-flags/:key/toggle — invierte el estado `enabled` de un
 * flag global. Devuelve `{ key, enabled }` con el nuevo estado. 404
 * FEATURE_FLAG_NO_ENCONTRADA si la key no existe.
 */
export async function toggleFeatureFlag(key: string): Promise<ToggleFeatureFlagResponse> {
  const res = await api.post<ToggleFeatureFlagResponse>(
    `/api/admin/feature-flags/${encodeURIComponent(key)}/toggle`,
  );
  return res.data;
}
