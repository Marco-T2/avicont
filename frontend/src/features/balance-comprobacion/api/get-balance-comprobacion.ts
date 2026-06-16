import { api } from '@/lib/api';
import type { BalanceComprobacionResponse } from '@/types/api';

import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

/**
 * GET /api/eeff/balance-comprobacion — Balance de Comprobación de Sumas y Saldos.
 *
 * REQ-BC-01: el rango se envía en exactamente uno de los dos modos
 * (mutuamente excluyentes): `periodoFiscalId` O `fechaDesde`+`fechaHasta`. El
 * service del backend rechaza ambos a la vez con 422.
 */
export async function getBalanceComprobacion(
  filtros: BalanceComprobacionFiltroValues,
): Promise<BalanceComprobacionResponse> {
  const params: Record<string, string | boolean> = {
    incluirAnulados: filtros.incluirAnulados,
  };

  if (filtros.modo === 'periodo') {
    params.periodoFiscalId = filtros.periodoFiscalId;
  } else {
    params.fechaDesde = filtros.fechaDesde;
    params.fechaHasta = filtros.fechaHasta;
  }

  const res = await api.get<BalanceComprobacionResponse>(
    '/api/eeff/balance-comprobacion',
    { params },
  );
  return res.data;
}
