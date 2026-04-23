import { api } from '@/lib/api';
import type { CreateInvitationRequest, CreateInvitationResponse } from '@/types/api';

// POST /api/invitations — el admin crea la invitación; el backend envía el
// email con el token. La response incluye el token en claro por si el
// mailer falla y el admin tiene que enviarlo a mano.
export async function createInvitation(
  body: CreateInvitationRequest,
): Promise<CreateInvitationResponse> {
  const res = await api.post<CreateInvitationResponse>('/api/invitations', body);
  return res.data;
}
