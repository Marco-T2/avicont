import { api } from '@/lib/api';
import type { CrearGestionRequest, GestionConPeriodos } from '@/types/api';

export async function crearGestion(
  body: CrearGestionRequest,
): Promise<GestionConPeriodos> {
  const res = await api.post<GestionConPeriodos>('/api/gestiones', body);
  return res.data;
}
