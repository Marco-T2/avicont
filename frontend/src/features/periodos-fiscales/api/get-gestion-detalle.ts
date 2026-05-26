import { api } from '@/lib/api';
import type { GestionConPeriodos } from '@/types/api';

export async function getGestionDetalle(id: string): Promise<GestionConPeriodos> {
  const res = await api.get<GestionConPeriodos>(`/api/gestiones/${id}`);
  return res.data;
}
