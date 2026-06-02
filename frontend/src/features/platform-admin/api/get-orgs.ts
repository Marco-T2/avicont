import { api } from '@/lib/api';
import type { PlatformOrg } from '@/types/api';

/**
 * Fetcher puro para GET /api/admin/platform/orgs.
 * Org-less: lista todas las organizaciones de la plataforma (super-admin).
 * El Bearer del super-admin basta; estos endpoints no usan TenantGuard.
 */
export async function getOrgs(): Promise<PlatformOrg[]> {
  const res = await api.get<PlatformOrg[]>('/api/admin/platform/orgs');
  return res.data;
}
