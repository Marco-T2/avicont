import { api } from '@/lib/api';

/**
 * Revoca el entitlement de un pack para una org (borra OrgPackEntitlement).
 * DELETE /api/admin/platform/orgs/:id/packs/:packId → void (204)
 * El packId es el id del entitlement (OrgPackEntitlement.id), no del Pack.
 */
export async function revocarPack(orgId: string, packId: string): Promise<void> {
  await api.delete(`/api/admin/platform/orgs/${orgId}/packs/${packId}`);
}
