import { api } from '@/lib/api';
import type { PlatformOrg, UpdateOrgStatusRequest } from '@/types/api';

/**
 * PATCH /api/admin/platform/orgs/:id/status — cambia el status de una org
 * (ACTIVE / SUSPENDED / ARCHIVED). Org-less: el Bearer del super-admin basta;
 * este endpoint no usa TenantGuard. Devuelve 404 si la org no existe.
 */
export async function updateOrgStatus(
  id: string,
  body: UpdateOrgStatusRequest,
): Promise<PlatformOrg> {
  const res = await api.patch<PlatformOrg>(`/api/admin/platform/orgs/${id}/status`, body);
  return res.data;
}
