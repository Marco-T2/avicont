import { api } from '@/lib/api';
import type { Cobro, UpdateCobroRequest } from '@/types/api';

// PUT full-state (espejo de D-17/D-20): cambiar el contactoId viaja por acá —
// el backend desvincula TODAS las aplicaciones si el contacto cambió.
export async function updateCobro(id: string, body: UpdateCobroRequest): Promise<Cobro> {
  const res = await api.put<Cobro>(`/api/cobros/${id}`, body);
  return res.data;
}
