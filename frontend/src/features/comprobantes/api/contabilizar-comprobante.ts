import { api } from '@/lib/api';
import type { Comprobante } from '@/types/api';

export async function contabilizarComprobante(id: string): Promise<Comprobante> {
  const res = await api.post<Comprobante>(`/api/comprobantes/${id}/contabilizar`);
  return res.data;
}
