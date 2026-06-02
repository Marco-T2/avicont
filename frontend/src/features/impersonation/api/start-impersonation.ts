import { api } from '@/lib/api';
import type {
  StartImpersonationRequest,
  StartImpersonationResponse,
} from '@/types/api';

// POST /api/admin/impersonate — OWNER del tenant activo o super-admin org-less.
// El super-admin puede especificar organizationId en el body para impersonar en
// una org donde no es miembro. El OWNER no envía organizationId (usa su contexto).
// exactOptionalPropertyTypes: spread condicional para no enviar undefined como campo.
export async function startImpersonation(
  body: StartImpersonationRequest,
): Promise<StartImpersonationResponse> {
  const payload = {
    targetUserId: body.targetUserId,
    reason: body.reason,
    ...(body.organizationId !== undefined ? { organizationId: body.organizationId } : {}),
  };
  const res = await api.post<StartImpersonationResponse>(
    '/api/admin/impersonate',
    payload,
  );
  return res.data;
}
