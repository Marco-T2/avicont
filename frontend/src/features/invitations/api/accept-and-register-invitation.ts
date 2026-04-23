import { api } from '@/lib/api';
import type {
  AcceptAndRegisterRequest,
  AcceptAndRegisterResponse,
} from '@/types/api';

// POST /api/invitations/accept-and-register — público.
// Crea cuenta nueva + acepta la invitación en la misma transacción.
// Falla con 409 si ya existe un user con ese email.
export async function acceptAndRegisterInvitation(
  body: AcceptAndRegisterRequest,
): Promise<AcceptAndRegisterResponse> {
  const res = await api.post<AcceptAndRegisterResponse>(
    '/api/invitations/accept-and-register',
    body,
  );
  return res.data;
}
