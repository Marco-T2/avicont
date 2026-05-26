import { api } from '@/lib/api';
import type { Periodo, ReabrirPeriodoRequest } from '@/types/api';

export async function reabrirPeriodo(
  id: string,
  body: ReabrirPeriodoRequest,
): Promise<Periodo> {
  const res = await api.post<Periodo>(`/api/periodos/${id}/reabrir`, body);
  return res.data;
}
