import { api } from '@/lib/api';
import type { HojaTrabajoResponse } from '@/types/api';

import type { HojaTrabajoFiltroValues } from '../schemas/hoja-trabajo-filtro-schema';

/**
 * GET /api/eeff/hoja-trabajo — Hoja de Trabajo de 12 columnas.
 *
 * El filtro siempre es un rango de fechas (fechaDesde + fechaHasta).
 * El componente compartido `PeriodoGestionFiltro` resuelve cualquier preset
 * a un rango antes de emitir — el wire nunca recibe periodoFiscalId.
 */
export async function getHojaTrabajo(
  filtros: HojaTrabajoFiltroValues,
): Promise<HojaTrabajoResponse> {
  const res = await api.get<HojaTrabajoResponse>('/api/eeff/hoja-trabajo', {
    params: {
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
      incluirAnulados: filtros.incluirAnulados,
    },
  });
  return res.data;
}
