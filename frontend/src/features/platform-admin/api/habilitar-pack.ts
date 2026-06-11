import { api } from '@/lib/api';
import type { OrgPackEntitlement } from '@/types/api';

/**
 * Habilita un pack para una org (crea el OrgPackEntitlement con activo=false).
 * POST /api/admin/platform/orgs/:id/packs → OrgPackEntitlement (201)
 * Envía `clave` (más estable que UUID, R-07 del design).
 */
export async function habilitarPack(orgId: string, clave: string): Promise<OrgPackEntitlement> {
  const res = await api.post<OrgPackEntitlement>(
    `/api/admin/platform/orgs/${orgId}/packs`,
    { clave },
  );
  return res.data;
}
