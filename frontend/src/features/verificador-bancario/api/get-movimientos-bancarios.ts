import { api } from '@/lib/api';
import type {
  ListadoMovimientosBancarios,
  ListarMovimientosBancariosParams,
} from '@/types/api';

/**
 * GET /api/movimientos-bancarios — mayor unificado cross-cuenta (REQ-VMB-01).
 *
 * El rango `desde`/`hasta` es OBLIGATORIO; el resto de los filtros son opt-in.
 * Sin `estado` el backend devuelve TODO (REQ-VMB-02) y la auditoría de
 * vínculos rotos viene con `aplicada=false`. `desde > hasta` → 422
 * `CONCILIACION_LISTADO_RANGO_INVALIDO`.
 *
 * Cada fila trae `estadoEfectivo` DERIVADO en la lectura (REQ-VMB-06) — la UI
 * muestra siempre ese, nunca la columna cacheada `estado`.
 */
export async function getMovimientosBancarios(
  params: ListarMovimientosBancariosParams,
): Promise<ListadoMovimientosBancarios> {
  const res = await api.get<ListadoMovimientosBancarios>('/api/movimientos-bancarios', {
    params,
  });
  return res.data;
}
