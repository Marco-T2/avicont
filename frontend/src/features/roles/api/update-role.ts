import { api } from '@/lib/api';
import type { CustomRole, UpdateCustomRoleRequest } from '@/types/api';

// PATCH /api/custom-roles/:id
export async function updateRole(
  id: string,
  body: UpdateCustomRoleRequest,
): Promise<CustomRole> {
  const res = await api.patch<CustomRole>(`/api/custom-roles/${id}`, body);
  return res.data;
}
