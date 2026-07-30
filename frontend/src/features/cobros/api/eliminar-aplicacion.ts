import { api } from '@/lib/api';

// Desaplicar NO es un hecho contable (D-03): sin confirmación en la UI (D-14)
// y sin period lock en el backend.
export async function eliminarAplicacion(cobroId: string, aplicacionId: string): Promise<void> {
  await api.delete(`/api/cobros/${cobroId}/aplicaciones/${aplicacionId}`);
}
