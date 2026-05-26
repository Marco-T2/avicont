import { api } from '@/lib/api';
import type { ResumenPrecierre } from '@/types/api';

export async function getResumenPrecierre(id: string): Promise<ResumenPrecierre> {
  const res = await api.get<ResumenPrecierre>(`/api/periodos/${id}/resumen-precierre`);
  return res.data;
}
