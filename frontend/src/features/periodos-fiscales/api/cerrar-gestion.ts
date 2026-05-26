import { api } from '@/lib/api';
import type { Gestion } from '@/types/api';

export async function cerrarGestion(id: string): Promise<Gestion> {
  const res = await api.post<Gestion>(`/api/gestiones/${id}/cerrar`);
  return res.data;
}
