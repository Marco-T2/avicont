import { api } from '@/lib/api';
import type { Comprobante } from '@/types/api';

export async function getComprobante(id: string): Promise<Comprobante> {
  const res = await api.get<Comprobante>(`/api/comprobantes/${id}`);
  return res.data;
}
