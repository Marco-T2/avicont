import { api } from '@/lib/api';
import type { ArranqueAplicado, DeclararArranqueRequest } from '@/types/api';

/**
 * POST /api/conciliacion/arranques — declara un punto de arranque conciliado
 * (REQ-ICB-04): fecha, ambos saldos y la diferencia residual ACEPTADA, los
 * CUATRO datos declarados por el usuario (la residual jamás se calcula como
 * extracto − libros).
 *
 * Append-only: una declaración posterior nunca borra las anteriores; `vigenteA`
 * decide cuál aplica a cada corte. Exige `contabilidad.conciliacion.conciliar`.
 */
export async function declararArranque(
  body: DeclararArranqueRequest,
): Promise<ArranqueAplicado> {
  const res = await api.post<ArranqueAplicado>('/api/conciliacion/arranques', body);
  return res.data;
}
