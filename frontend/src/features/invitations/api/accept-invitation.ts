import { api } from '@/lib/api';
import type { Invitation } from '@/types/api';

// POST /api/invitations/accept — requiere JWT. El email del user logueado
// debe coincidir con el de la invitación (backend verifica).
export async function acceptInvitation(token: string): Promise<Invitation> {
  const res = await api.post<Invitation>('/api/invitations/accept', { token });
  return res.data;
}
