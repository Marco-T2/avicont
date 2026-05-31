import { api } from '@/lib/api';
import type { MePermissionsResponse } from '@/types/api';

/**
 * Fetcher puro para GET /api/me/permissions.
 * Devuelve los permisos efectivos del usuario autenticado en el tenant activo.
 *
 * `permissions` son patrones con posibles wildcards (ej. "contabilidad.*") —
 * usar permission-matcher.ts para evaluarlos, NO Array.includes().
 */
export async function getMePermissions(): Promise<MePermissionsResponse> {
  const res = await api.get<MePermissionsResponse>('/api/me/permissions');
  return res.data;
}
