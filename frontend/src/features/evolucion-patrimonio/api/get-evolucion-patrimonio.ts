import { api } from '@/lib/api';
import type { EvolucionPatrimonioResponse } from '@/types/api';

import type { EvolucionPatrimonioFiltroValues } from '../schemas/evolucion-patrimonio-filtro-schema';

/**
 * GET /api/eeff/evolucion-patrimonio — Estado de Evolución del Patrimonio Neto.
 *
 * El filtro siempre es un rango de fechas (fechaDesde + fechaHasta).
 * El componente compartido `PeriodoGestionFiltro` resuelve cualquier preset
 * (gestión, mes, rango personalizado) a un rango antes de emitir —
 * el wire nunca recibe periodoFiscalId.
 */
export async function getEvolucionPatrimonio(
  filtros: EvolucionPatrimonioFiltroValues,
): Promise<EvolucionPatrimonioResponse> {
  const res = await api.get<EvolucionPatrimonioResponse>('/api/eeff/evolucion-patrimonio', {
    params: {
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
      incluirAnulados: filtros.incluirAnulados,
    },
  });
  return res.data;
}
