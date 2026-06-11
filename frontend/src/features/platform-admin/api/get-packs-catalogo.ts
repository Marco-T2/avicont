import { api } from '@/lib/api';
import type { Pack } from '@/types/api';

/**
 * Catálogo global de packs vendibles (super-admin, org-less).
 * GET /api/admin/platform/packs → Pack[]
 * Requiere JWT de super-admin (SuperAdminGuard en el controller).
 */
export async function getPacksCatalogo(): Promise<Pack[]> {
  const res = await api.get<Pack[]>('/api/admin/platform/packs');
  return res.data;
}
