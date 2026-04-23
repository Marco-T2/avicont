import { api } from '@/lib/api';

// POST /api/admin/impersonate/end — se llama con el access token de
// impersonation activo. Marca endedAt en el log; el token sigue válido hasta
// que expire por TTL, pero el backend trata la sesión como cerrada.
export async function endImpersonation(): Promise<void> {
  await api.post('/api/admin/impersonate/end');
}
