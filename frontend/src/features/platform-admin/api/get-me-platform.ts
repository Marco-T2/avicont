import { api } from '@/lib/api';
import type { MePlatformResponse } from '@/types/api';

/**
 * Fetcher puro para GET /api/me/platform.
 * Org-less: devuelve la identidad de plataforma del usuario (isSuperAdmin),
 * sin depender del tenant activo. Un usuario normal recibe { isSuperAdmin: false }.
 */
export async function getMePlatform(): Promise<MePlatformResponse> {
  const res = await api.get<MePlatformResponse>('/api/me/platform');
  return res.data;
}
