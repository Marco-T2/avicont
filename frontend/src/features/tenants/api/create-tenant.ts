import { api } from '@/lib/api';
import type {
  CreateTenantRequest,
  CreateTenantResponse,
  ModuloOrganizacion,
} from '@/types/api';

// POST /api/tenants — crea la organización y la membership OWNER del usuario
// autenticado en una transacción. Requiere sesión activa (Bearer en el store).
// El modulo determina el seeding inicial y los feature flags (lo exige el backend).
export async function createTenant(
  name: string,
  modulo: ModuloOrganizacion,
): Promise<CreateTenantResponse> {
  const body: CreateTenantRequest = { name, modulo };
  const res = await api.post<CreateTenantResponse>('/api/tenants', body);
  return res.data;
}
