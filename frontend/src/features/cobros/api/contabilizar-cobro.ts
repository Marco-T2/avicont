import { api } from '@/lib/api';
import type { CobroContabilizado } from '@/types/api';

export async function contabilizarCobro(id: string): Promise<CobroContabilizado> {
  const res = await api.post<CobroContabilizado>(`/api/cobros/${id}/contabilizar`);
  return res.data;
}
