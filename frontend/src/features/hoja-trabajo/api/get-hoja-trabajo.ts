import { api } from '@/lib/api';
import type { HojaTrabajoResponse } from '@/types/api';

import type { HojaTrabajoFiltroValues } from '../schemas/hoja-trabajo-filtro-schema';

/**
 * GET /api/eeff/hoja-trabajo — Hoja de Trabajo de 12 columnas.
 *
 * REQ-HT-01: el rango se envía en exactamente uno de los dos modos
 * (mutuamente excluyentes): `periodoFiscalId` O `desde`+`hasta`. El service del
 * backend rechaza ambos a la vez con 422.
 */
export async function getHojaTrabajo(
  filtros: HojaTrabajoFiltroValues,
): Promise<HojaTrabajoResponse> {
  const params: Record<string, string | boolean> = {
    incluirAnulados: filtros.incluirAnulados,
  };

  if (filtros.modo === 'periodo') {
    params.periodoFiscalId = filtros.periodoFiscalId;
  } else {
    params.desde = filtros.fechaDesde;
    params.hasta = filtros.fechaHasta;
  }

  const res = await api.get<HojaTrabajoResponse>('/api/eeff/hoja-trabajo', { params });
  return res.data;
}
