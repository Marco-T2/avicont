import { api } from '@/lib/api';
import type { UpdateVentaRequest, Venta } from '@/types/api';

export async function updateVenta(
  id: string,
  payload: UpdateVentaRequest,
): Promise<Venta> {
  const res = await api.put<Venta>(`/api/ventas/${id}`, payload);
  return res.data;
}
