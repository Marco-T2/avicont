import { api } from '@/lib/api';
import type { PlatformDashboard } from '@/types/api';

/**
 * Fetcher puro para GET /api/admin/platform/dashboard.
 * Org-less: agrega KPIs de todas las organizaciones (super-admin).
 * El Bearer del super-admin basta; sin TenantGuard (Anti-31 documentado en el port).
 */
export async function getPlatformDashboard(): Promise<PlatformDashboard> {
  const res = await api.get<PlatformDashboard>('/api/admin/platform/dashboard');
  return res.data;
}
