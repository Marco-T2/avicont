import { api } from '@/lib/api';
import type { CreateCustomRoleRequest, CustomRole } from '@/types/api';

// POST /api/custom-roles
export async function createRole(
  body: CreateCustomRoleRequest,
): Promise<CustomRole> {
  const res = await api.post<CustomRole>('/api/custom-roles', body);
  return res.data;
}
