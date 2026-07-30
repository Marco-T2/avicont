import { api } from '@/lib/api';
import type { EditarAplicacionRequest } from '@/types/api';

export async function editarAplicacion(
  cobroId: string,
  aplicacionId: string,
  body: EditarAplicacionRequest,
): Promise<void> {
  await api.put(`/api/cobros/${cobroId}/aplicaciones/${aplicacionId}`, body);
}
