import { api } from '@/lib/api';
import type { ActualizarEstadoMovimientoRequest, MovimientoBancario } from '@/types/api';

/**
 * PATCH /api/movimientos-bancarios/:id/estado — Ignora o des-ignora un
 * movimiento (REQ-CB-18).
 *
 * Solo admite `IGNORADO` y `PENDIENTE`. `CONCILIADO` NO se fija a mano: esa
 * transición es exclusiva de `POST /api/conciliacion/matches` (REQ-CB-17), el
 * único camino que mantiene la invariante
 * `estado === 'CONCILIADO' ⟺ existe MatchConciliacion`.
 */
export async function actualizarEstadoMovimiento(
  id: string,
  body: ActualizarEstadoMovimientoRequest,
): Promise<MovimientoBancario> {
  const res = await api.patch<MovimientoBancario>(
    `/api/movimientos-bancarios/${id}/estado`,
    body,
  );
  return res.data;
}
