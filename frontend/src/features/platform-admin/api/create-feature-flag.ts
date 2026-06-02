import { api } from '@/lib/api';
import type { CreateFeatureFlagRequest, FeatureFlag } from '@/types/api';

/**
 * POST /api/admin/feature-flags — crea un feature flag global. Devuelve la fila
 * creada. 400 si la `key` no matchea ^[a-z][a-z0-9_]*$ (≤100); 409
 * FEATURE_FLAG_DUPLICADA si ya existe un flag global con esa key.
 */
export async function createFeatureFlag(body: CreateFeatureFlagRequest): Promise<FeatureFlag> {
  const res = await api.post<FeatureFlag>('/api/admin/feature-flags', body);
  return res.data;
}
