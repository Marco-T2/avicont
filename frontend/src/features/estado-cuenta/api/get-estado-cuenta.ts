import { api } from '@/lib/api';
import type { EstadoCuenta } from '@/types/api';

export async function getEstadoCuenta(contactoId: string): Promise<EstadoCuenta> {
  const res = await api.get<EstadoCuenta>(`/api/estado-cuenta/${contactoId}`);
  return res.data;
}
