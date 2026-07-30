import { api } from '@/lib/api';
import type { Venta } from '@/types/api';

export async function getVenta(id: string): Promise<Venta> {
  const res = await api.get<Venta>(`/api/ventas/${id}`);
  return res.data;
}
