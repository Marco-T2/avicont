import { api } from '@/lib/api';
import type { ListarPeriodosParams, Periodo } from '@/types/api';

export async function getPeriodos(
  params: ListarPeriodosParams = {},
): Promise<Periodo[]> {
  const res = await api.get<Periodo[]>('/api/periodos', {
    params: {
      ...(params.gestionId !== undefined ? { gestionId: params.gestionId } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
    },
  });
  return res.data;
}
