import { api } from '@/lib/api';
import type { CustomRole } from '@/types/api';

// GET /api/custom-roles — roles custom del tenant activo.
export async function getRoles(): Promise<CustomRole[]> {
  const res = await api.get<CustomRole[]>('/api/custom-roles');
  return res.data;
}
