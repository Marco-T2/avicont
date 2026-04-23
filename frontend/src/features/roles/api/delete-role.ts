import { api } from '@/lib/api';

// DELETE /api/custom-roles/:id → 204
export async function deleteRole(id: string): Promise<void> {
  await api.delete(`/api/custom-roles/${id}`);
}
