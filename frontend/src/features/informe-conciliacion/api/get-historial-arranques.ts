import { api } from '@/lib/api';
import type { ArranqueAplicado } from '@/types/api';

/**
 * GET /api/conciliacion/arranques — historial COMPLETO de declaraciones de
 * arranque de una cuenta bancaria (REQ-ICB-04, design D8).
 *
 * Orden `fecha DESC, createdAt DESC`: el MISMO desempate que `vigenteA` en el
 * backend, así la UI señala cuál declaración aplica a un corte SIN re-ordenar
 * — es la primera fila con `fecha <= corte`. Sin paginar: es un registro de
 * actos puntuales y ninguna declaración se oculta jamás.
 */
export async function getHistorialArranques(
  cuentaBancariaId: string,
): Promise<ArranqueAplicado[]> {
  const res = await api.get<ArranqueAplicado[]>('/api/conciliacion/arranques', {
    params: { cuentaBancariaId },
  });
  return res.data;
}
