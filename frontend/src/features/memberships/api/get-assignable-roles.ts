import { api } from '@/lib/api';
import type { AssignableRole } from '@/types/api';

// GET /api/memberships/roles-asignables — roles asignables del tenant activo
// (system + custom), gateado por organizacion.miembros.invite.
export async function getAssignableRoles(): Promise<AssignableRole[]> {
  const res = await api.get<AssignableRole[]>('/api/memberships/roles-asignables');
  return res.data;
}
