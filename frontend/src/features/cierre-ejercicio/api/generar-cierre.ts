import { api } from '@/lib/api';
import type { CierreEjercicioResponse } from '@/types/api';

export async function generarCierre(gestionId: string): Promise<CierreEjercicioResponse> {
  const res = await api.post<CierreEjercicioResponse>(`/api/gestiones/${gestionId}/cierre`);
  return res.data;
}
