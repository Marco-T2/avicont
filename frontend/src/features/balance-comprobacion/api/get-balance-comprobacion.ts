import { api } from '@/lib/api';
import type { BalanceComprobacionResponse } from '@/types/api';

import type { BalanceComprobacionFiltroValues } from '../schemas/balance-comprobacion-filtro-schema';

/**
 * GET /api/eeff/balance-comprobacion — Balance de Comprobación de Sumas y Saldos.
 *
 * El filtro siempre es un rango de fechas (fechaDesde + fechaHasta).
 * El componente compartido `PeriodoGestionFiltro` resuelve cualquier preset
 * a un rango antes de emitir — el wire nunca recibe periodoFiscalId.
 *
 * REQ-BC-01: si no se cumple, el backend responde 422 BALANCE_COMPROBACION_FILTRO_INVALIDO.
 */
export async function getBalanceComprobacion(
  filtros: BalanceComprobacionFiltroValues,
): Promise<BalanceComprobacionResponse> {
  const res = await api.get<BalanceComprobacionResponse>(
    '/api/eeff/balance-comprobacion',
    {
      params: {
        fechaDesde: filtros.fechaDesde,
        fechaHasta: filtros.fechaHasta,
        ...(filtros.incluirAnulados === true ? { incluirAnulados: true } : {}),
      },
    },
  );
  return res.data;
}
