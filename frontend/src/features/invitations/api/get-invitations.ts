import { api } from '@/lib/api';
import type { Invitation, InvitationStatus } from '@/types/api';

// GET /api/invitations[?status=PENDING]
export async function getInvitations(
  status?: InvitationStatus,
): Promise<Invitation[]> {
  const res = await api.get<Invitation[]>('/api/invitations', {
    params: status !== undefined ? { status } : {},
  });
  return res.data;
}
