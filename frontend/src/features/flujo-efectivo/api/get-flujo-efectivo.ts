import { api } from '@/lib/api';
import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import type { FlujoEfectivoFiltroValues } from '../schemas/flujo-efectivo-filtro-schema';

/**
 * GET /api/eeff/flujo-efectivo — Estado de Flujo de Efectivo (método indirecto).
 *
 * El rango se envía en exactamente uno de los dos modos (mutuamente excluyentes):
 * `periodoFiscalId` O `fechaDesde`+`fechaHasta`. El service del backend resuelve
 * el rango con prioridad fechas > período.
 */
export async function getFlujoEfectivo(
  filtros: FlujoEfectivoFiltroValues,
): Promise<EstadoFlujoEfectivoResponse> {
  const params: Record<string, string | boolean> = {
    incluirAnulados: filtros.incluirAnulados,
  };

  if (filtros.modo === 'periodo') {
    params.periodoFiscalId = filtros.periodoFiscalId;
  } else {
    params.fechaDesde = filtros.fechaDesde;
    params.fechaHasta = filtros.fechaHasta;
  }

  const res = await api.get<EstadoFlujoEfectivoResponse>('/api/eeff/flujo-efectivo', {
    params,
  });
  return res.data;
}
