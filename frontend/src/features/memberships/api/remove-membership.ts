import { api } from '@/lib/api';

// DELETE /api/memberships/:id — remueve al miembro del tenant activo.
// El backend valida que no sea el último OWNER (ForbiddenException si lo es).
export async function removeMembership(id: string): Promise<void> {
  await api.delete(`/api/memberships/${id}`);
}
