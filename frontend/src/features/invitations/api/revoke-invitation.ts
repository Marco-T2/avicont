import { api } from '@/lib/api';

// DELETE /api/invitations/:id — marca la invitación como REVOKED.
export async function revokeInvitation(id: string): Promise<void> {
  await api.delete(`/api/invitations/${id}`);
}
