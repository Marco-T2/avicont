import { api } from '@/lib/api';
import type { CrearMatchRequest, MatchConciliacion } from '@/types/api';

/**
 * POST /api/conciliacion/matches — Confirma un par movimiento ↔ línea contable
 * (REQ-CB-17, la acción central del producto).
 *
 * El sistema NUNCA auto-confirma (decisión 2): esta llamada siempre nace de una
 * acción explícita del usuario. Requiere `contabilidad.conciliacion.conciliar`.
 */
export async function crearMatch(body: CrearMatchRequest): Promise<MatchConciliacion> {
  const res = await api.post<MatchConciliacion>('/api/conciliacion/matches', body);
  return res.data;
}
