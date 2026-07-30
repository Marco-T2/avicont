import { api } from '@/lib/api';
import type { ListarVentasParams, VentaListResponse } from '@/types/api';

export async function getVentas(
  params: ListarVentasParams = {},
): Promise<VentaListResponse> {
  const res = await api.get<VentaListResponse>('/api/ventas', { params });
  return res.data;
}
