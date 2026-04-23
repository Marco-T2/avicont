import { api } from '@/lib/api';
import type { SwitchTenantResponse } from '@/types/api';

// POST /api/auth/switch-tenant — el backend valida que el user sea miembro
// del tenant, emite un nuevo accessToken con activeTenantId actualizado y
// rota la cookie refreshToken.
export async function switchTenant(tenantId: string): Promise<SwitchTenantResponse> {
  const res = await api.post<SwitchTenantResponse>('/api/auth/switch-tenant', {
    tenantId,
  });
  return res.data;
}
