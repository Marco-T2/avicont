import { api } from '@/lib/api';
import type { Cuenta } from '@/types/api';

export async function getCuentaDetail(id: string): Promise<Cuenta> {
  const res = await api.get<Cuenta>(`/api/cuentas/${id}`);
  return res.data;
}
