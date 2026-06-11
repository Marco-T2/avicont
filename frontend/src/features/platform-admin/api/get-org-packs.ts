import { api } from '@/lib/api';
import type { OrgPackEntitlement } from '@/types/api';

/**
 * Entitlements de packs habilitados para una org (super-admin).
 * GET /api/admin/platform/orgs/:id/packs → OrgPackEntitlement[]
 */
export async function getOrgPacks(orgId: string): Promise<OrgPackEntitlement[]> {
  const res = await api.get<OrgPackEntitlement[]>(`/api/admin/platform/orgs/${orgId}/packs`);
  return res.data;
}
