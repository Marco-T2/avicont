import { api } from '@/lib/api';
import type { FeatureFlagListResponse } from '@/types/api';

// GET /api/feature-flags/list — devuelve `{ global, overrides }`.
// `global` excluye flags que ya tienen override en este tenant.
export async function listFeatureFlags(): Promise<FeatureFlagListResponse> {
  const res = await api.get<FeatureFlagListResponse>('/api/feature-flags/list');
  return res.data;
}
