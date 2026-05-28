import { api } from '@/lib/api';
import type { ListarComprobantesParams, ListarComprobantesResponse } from '@/types/api';

export async function getComprobantes(
  params: ListarComprobantesParams = {},
): Promise<ListarComprobantesResponse> {
  const res = await api.get<ListarComprobantesResponse>('/api/comprobantes', { params });
  return res.data;
}
