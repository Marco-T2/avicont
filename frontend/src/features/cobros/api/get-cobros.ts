import { api } from '@/lib/api';
import type { CobroListResponse, ListarCobrosParams } from '@/types/api';

export async function getCobros(params: ListarCobrosParams = {}): Promise<CobroListResponse> {
  const res = await api.get<CobroListResponse>('/api/cobros', { params });
  return res.data;
}
