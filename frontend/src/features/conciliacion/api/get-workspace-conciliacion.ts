import { api } from '@/lib/api';
import type { WorkspaceConciliacion, WorkspaceConciliacionParams } from '@/types/api';

/**
 * GET /api/conciliacion — Workspace de conciliación de UNA cuenta bancaria en
 * un rango (design §10).
 *
 * El rango es OBLIGATORIO: los dos paneles se calculan sobre él y sin acotarlo
 * la lectura crecería sin techo. `desde > hasta` → 422
 * `CONCILIACION_RANGO_INVALIDO`.
 *
 * REQ-CB-10: la respuesta trae `estadoEfectivo` (derivado) además de la columna
 * persistida `estado`. La UI muestra SIEMPRE `estadoEfectivo`.
 */
export async function getWorkspaceConciliacion(
  params: WorkspaceConciliacionParams,
): Promise<WorkspaceConciliacion> {
  const res = await api.get<WorkspaceConciliacion>('/api/conciliacion', { params });
  return res.data;
}
