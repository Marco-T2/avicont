import { api } from '@/lib/api';
import type { InvitationPreview } from '@/types/api';

// GET /api/invitations/preview?token=... — público, el token es la autorización.
export async function previewInvitation(
  token: string,
): Promise<InvitationPreview> {
  const res = await api.get<InvitationPreview>('/api/invitations/preview', {
    params: { token },
  });
  return res.data;
}
