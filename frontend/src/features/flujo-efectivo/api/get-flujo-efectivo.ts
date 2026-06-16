import { api } from '@/lib/api';
import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import type { FlujoEfectivoFiltroValues } from '../schemas/flujo-efectivo-filtro-schema';

/**
 * GET /api/eeff/flujo-efectivo — Estado de Flujo de Efectivo (método indirecto).
 *
 * El rango se envía en exactamente uno de los dos modos (mutuamente excluyentes):
 * `periodoFiscalId` O `desde`+`hasta`. El service del backend resuelve el rango
 * con prioridad fechas > período.
 *
 * TRAMPA R2: el endpoint usa `desde`/`hasta` (no `fechaDesde`/`fechaHasta` como el
 * EEPN). El schema del form mantiene `fechaDesde`/`fechaHasta` (es UI); el mapeo a
 * `desde`/`hasta` ocurre acá en la capa api.
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
    // El endpoint espera `desde`/`hasta`, no `fechaDesde`/`fechaHasta`
    params.desde = filtros.fechaDesde;
    params.hasta = filtros.fechaHasta;
  }

  const res = await api.get<EstadoFlujoEfectivoResponse>('/api/eeff/flujo-efectivo', {
    params,
  });
  return res.data;
}
