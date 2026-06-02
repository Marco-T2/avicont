import { api } from '@/lib/api';

/**
 * DELETE /api/admin/feature-flags/:key — elimina un feature flag global de forma
 * permanente (hard delete). 404 FEATURE_FLAG_NO_ENCONTRADA si la key no existe.
 */
export async function deleteFeatureFlag(key: string): Promise<void> {
  await api.delete(`/api/admin/feature-flags/${encodeURIComponent(key)}`);
}
