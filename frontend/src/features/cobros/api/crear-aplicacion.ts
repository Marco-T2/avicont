import { api } from '@/lib/api';
import type { AplicacionCobro, CrearAplicacionRequest } from '@/types/api';

// Las aplicaciones viajan EXPLÍCITAS (venta + monto): la sugerencia FIFO de la
// pantalla nunca se convierte en auto-match silencioso (REQ-CXC-05).
export async function crearAplicacion(
  cobroId: string,
  body: CrearAplicacionRequest,
): Promise<AplicacionCobro> {
  const res = await api.post<AplicacionCobro>(`/api/cobros/${cobroId}/aplicaciones`, body);
  return res.data;
}
