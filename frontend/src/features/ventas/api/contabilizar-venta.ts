import { api } from '@/lib/api';
import type { VentaContabilizada } from '@/types/api';

export async function contabilizarVenta(id: string): Promise<VentaContabilizada> {
  const res = await api.post<VentaContabilizada>(`/api/ventas/${id}/contabilizar`);
  return res.data;
}
