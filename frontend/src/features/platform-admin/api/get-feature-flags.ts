import { api } from '@/lib/api';
import type { FeatureFlag } from '@/types/api';

/**
 * GET /api/admin/feature-flags — lista el catálogo GLOBAL de feature flags.
 * Org-less: el Bearer del super-admin basta (sin TenantGuard). El controller
 * devuelve las filas Prisma crudas (organizationId === null para los globales).
 */
export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const res = await api.get<FeatureFlag[]>('/api/admin/feature-flags');
  return res.data;
}
