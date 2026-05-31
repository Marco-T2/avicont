import { api } from '@/lib/api';
import type { BalanceGeneralResponse } from '@/types/api';

import type { BalanceGeneralFiltroValues } from '../schemas/balance-general-filtro-schema';

export async function getBalanceGeneral(
  filtros: BalanceGeneralFiltroValues,
): Promise<BalanceGeneralResponse> {
  const params: Record<string, string | boolean> = {
    fecha: filtros.fecha,
    incluirAnulados: filtros.incluirAnulados,
  };

  const res = await api.get<BalanceGeneralResponse>('/api/eeff/balance', { params });
  return res.data;
}
