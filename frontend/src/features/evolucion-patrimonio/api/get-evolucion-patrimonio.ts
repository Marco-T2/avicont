import { api } from '@/lib/api';
import type { EvolucionPatrimonioResponse } from '@/types/api';

import type { EvolucionPatrimonioFiltroValues } from '../schemas/evolucion-patrimonio-filtro-schema';

/**
 * GET /api/eeff/evolucion-patrimonio — Estado de Evolución del Patrimonio Neto.
 *
 * El rango se envía en exactamente uno de los dos modos (mutuamente excluyentes):
 * `periodoFiscalId` O `fechaDesde`+`fechaHasta`. El service del backend resuelve
 * el rango con prioridad fechas > período > gestión.
 */
export async function getEvolucionPatrimonio(
  filtros: EvolucionPatrimonioFiltroValues,
): Promise<EvolucionPatrimonioResponse> {
  const params: Record<string, string | boolean> = {
    incluirAnulados: filtros.incluirAnulados,
  };

  if (filtros.modo === 'periodo') {
    params.periodoFiscalId = filtros.periodoFiscalId;
  } else {
    params.fechaDesde = filtros.fechaDesde;
    params.fechaHasta = filtros.fechaHasta;
  }

  const res = await api.get<EvolucionPatrimonioResponse>('/api/eeff/evolucion-patrimonio', {
    params,
  });
  return res.data;
}
