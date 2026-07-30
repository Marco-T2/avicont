import { api } from '@/lib/api';
import type { Cobro } from '@/types/api';

export async function getCobro(id: string): Promise<Cobro> {
  const res = await api.get<Cobro>(`/api/cobros/${id}`);
  return res.data;
}
