import { api } from '@/lib/api';

/**
 * DELETE /api/conciliacion/matches/:id — Deshace un match (REQ-CB-17).
 *
 * Borra el `MatchConciliacion` y devuelve el movimiento a `PENDIENTE`. NUNCA
 * toca el comprobante ni sus líneas (decisión 3, REQ-CB-15).
 */
export async function borrarMatch(id: string): Promise<void> {
  await api.delete(`/api/conciliacion/matches/${id}`);
}
