import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

export async function mapearPuct(id: string, codigoPuct: string): Promise<Cuenta> {
  const res = await api.post<Cuenta>(`/api/cuentas/${id}/mapear-puct`, { codigoPuct });
  return res.data;
}
