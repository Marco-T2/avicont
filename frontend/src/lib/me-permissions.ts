import { api } from '@/lib/api';
import type { MePermissionsResponse } from '@/types/api';

/**
 * Fetcher puro para GET /api/me/permissions.
 * Devuelve los permisos efectivos del usuario autenticado en el tenant activo.
 *
 * `permissions` son strings de permiso EXACTOS, ya expandidos contra el catálogo
 * por el backend (NO patrones de wildcards). Se evalúan con permission-matcher.ts
 * por robustez ante un eventual cambio de contrato.
 */
export async function getMePermissions(): Promise<MePermissionsResponse> {
  const res = await api.get<MePermissionsResponse>('/api/me/permissions');
  return res.data;
}
