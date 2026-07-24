import { api } from '@/lib/api';
import type { PerfilExtractoDescriptor } from '@/types/api';

export async function getPerfilesExtracto(): Promise<PerfilExtractoDescriptor[]> {
  const res = await api.get<PerfilExtractoDescriptor[]>('/api/cuentas-bancarias/perfiles');
  return res.data;
}
