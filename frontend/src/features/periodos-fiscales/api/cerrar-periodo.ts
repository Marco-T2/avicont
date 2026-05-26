import { api } from '@/lib/api';
import type { Periodo } from '@/types/api';

export async function cerrarPeriodo(id: string): Promise<Periodo> {
  const res = await api.post<Periodo>(`/api/periodos/${id}/cerrar`);
  return res.data;
}
