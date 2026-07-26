import { api } from '@/lib/api';
import type { ArranqueAplicado } from '@/types/api';

/**
 * POST /api/conciliacion/arranques/:id/anular — anula una declaración
 * (REQ-ICB-04, §4.7).
 *
 * Marca, no borra: el acto sigue en el historial con su motivo y su autor. El
 * informe pasa a apoyarse en la declaración anterior, o se emite abstenido si
 * no queda ninguna. Exige `contabilidad.conciliacion.conciliar`.
 */
export async function anularArranque(
  id: string,
  body: { cuentaBancariaId: string; motivo: string },
): Promise<ArranqueAplicado> {
  const res = await api.post<ArranqueAplicado>(
    `/api/conciliacion/arranques/${id}/anular`,
    body,
  );
  return res.data;
}
