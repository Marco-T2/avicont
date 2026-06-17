import { api } from '@/lib/api';
import type { CierreEjercicioResponse } from '@/types/api';

export async function getCierre(gestionId: string): Promise<CierreEjercicioResponse> {
  const res = await api.get<CierreEjercicioResponse>(`/api/gestiones/${gestionId}/cierre`);
  return res.data;
}
