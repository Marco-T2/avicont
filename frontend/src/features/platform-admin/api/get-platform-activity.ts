import { api } from '@/lib/api';
import type { PlatformActivity, PlatformActivityParams } from '@/types/api';

/**
 * Fetcher puro para GET /api/admin/platform/activity.
 * Org-less: lista actividad de auditoría de la plataforma (super-admin).
 * Soporta cursor-based pagination (nextCursor opaco). El límite default del
 * backend es 20; máximo 100.
 */
export async function getPlatformActivity(
  params: PlatformActivityParams = {},
): Promise<PlatformActivity> {
  const res = await api.get<PlatformActivity>('/api/admin/platform/activity', { params });
  return res.data;
}
