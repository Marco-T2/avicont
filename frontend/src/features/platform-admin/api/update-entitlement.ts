import { api } from '@/lib/api';
import type { PlatformOrg, UpdateEntitlementRequest } from '@/types/api';

/**
 * PATCH /api/admin/platform/orgs/:id/entitlement — actualiza plan y/o verticales
 * de una org. Patch parcial: los campos ausentes conservan el valor actual.
 * Org-less: el Bearer del super-admin basta (sin TenantGuard).
 * Devuelve 404 si la org no existe y 422 (PLATFORM_VERTICAL_NO_EXCLUSIVO) si el
 * estado resultante deja ambas verticales activas.
 */
export async function updateEntitlement(
  id: string,
  body: UpdateEntitlementRequest,
): Promise<PlatformOrg> {
  const res = await api.patch<PlatformOrg>(
    `/api/admin/platform/orgs/${id}/entitlement`,
    body,
  );
  return res.data;
}
