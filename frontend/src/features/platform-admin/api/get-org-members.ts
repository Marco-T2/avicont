import { api } from '@/lib/api';
import type { PlatformOrgMember } from '@/types/api';

/**
 * Fetcher puro para GET /api/admin/platform/orgs/:id/members.
 * Org-less cross-tenant: lista todos los miembros (activos + desactivados) de
 * la organización. Solo accesible por super-admin (Bearer del SA basta).
 *
 * REQ-PM-01 — Slice 1 del change platform-admin-v1.1.
 */
export async function getOrgMembers(orgId: string): Promise<PlatformOrgMember[]> {
  const res = await api.get<PlatformOrgMember[]>(`/api/admin/platform/orgs/${orgId}/members`);
  return res.data;
}
