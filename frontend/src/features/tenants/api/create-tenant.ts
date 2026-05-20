import { api } from '@/lib/api';
import type { CreateTenantRequest, CreateTenantResponse } from '@/types/api';

// POST /api/tenants — crea la organización y la membership OWNER del usuario
// autenticado en una transacción. Requiere sesión activa (Bearer en el store).
export async function createTenant(
  name: string,
): Promise<CreateTenantResponse> {
  const body: CreateTenantRequest = { name };
  const res = await api.post<CreateTenantResponse>('/api/tenants', body);
  return res.data;
}
