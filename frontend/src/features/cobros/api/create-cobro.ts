import { api } from '@/lib/api';
import type { Cobro, CreateCobroRequest } from '@/types/api';

export async function createCobro(body: CreateCobroRequest): Promise<Cobro> {
  const res = await api.post<Cobro>('/api/cobros', body);
  return res.data;
}
