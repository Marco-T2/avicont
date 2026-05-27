import { api } from '@/lib/api';
import type { Comprobante } from '@/types/api';

export async function anularComprobante(id: string, motivo: string): Promise<Comprobante> {
  const res = await api.post<Comprobante>(`/api/comprobantes/${id}/anular`, { motivo });
  return res.data;
}
