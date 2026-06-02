import { api } from '@/lib/api';
import type { CreateOrgRequest, PlatformOrg } from '@/types/api';

/**
 * POST /api/admin/platform/orgs — crea una organización designando el OWNER por email.
 * Org-less: el Bearer del super-admin basta; este endpoint no usa TenantGuard.
 * Devuelve 422 (PLATFORM_ORG_OWNER_NOT_FOUND) si el ownerEmail no corresponde a
 * un usuario registrado.
 */
export async function createOrg(body: CreateOrgRequest): Promise<PlatformOrg> {
  const res = await api.post<PlatformOrg>('/api/admin/platform/orgs', body);
  return res.data;
}
