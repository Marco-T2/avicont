import { api } from '@/lib/api';
import type { Gestion, ListarGestionesParams } from '@/types/api';

export async function getGestiones(
  params: ListarGestionesParams = {},
): Promise<Gestion[]> {
  const res = await api.get<Gestion[]>('/api/gestiones', {
    params: {
      ...(params.status !== undefined ? { status: params.status } : {}),
    },
  });
  return res.data;
}
