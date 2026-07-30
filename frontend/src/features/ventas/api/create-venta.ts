import { api } from '@/lib/api';
import type { CreateVentaRequest, Venta } from '@/types/api';

export async function createVenta(payload: CreateVentaRequest): Promise<Venta> {
  const res = await api.post<Venta>('/api/ventas', payload);
  return res.data;
}
