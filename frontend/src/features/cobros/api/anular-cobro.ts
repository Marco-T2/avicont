import { api } from '@/lib/api';
import type { AnularCobroRequest } from '@/types/api';

// §4.7: anula por flag; el backend elimina las aplicaciones del cobro y las
// registra en AplicacionCobroDesvinculada (REQ-CXC-06 fila 9).
export async function anularCobro(id: string, motivo: string): Promise<void> {
  const body: AnularCobroRequest = { motivo };
  await api.post(`/api/cobros/${id}/anular`, body);
}
