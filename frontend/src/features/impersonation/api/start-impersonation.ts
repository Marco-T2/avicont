import { api } from '@/lib/api';
import type {
  StartImpersonationRequest,
  StartImpersonationResponse,
} from '@/types/api';

// POST /api/admin/impersonate — requiere OWNER del tenant activo.
// Devuelve un access token especial (vida 30 min, no refrescable).
export async function startImpersonation(
  body: StartImpersonationRequest,
): Promise<StartImpersonationResponse> {
  const res = await api.post<StartImpersonationResponse>(
    '/api/admin/impersonate',
    body,
  );
  return res.data;
}
