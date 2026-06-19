import { api } from '@/lib/api';
import type { EstadoFlujoEfectivoResponse } from '@/types/api';

import type { FlujoEfectivoFiltroValues } from '../schemas/flujo-efectivo-filtro-schema';

/**
 * GET /api/eeff/flujo-efectivo — Estado de Flujo de Efectivo (método indirecto).
 *
 * El rango siempre se envía como `fechaDesde`+`fechaHasta`. El componente
 * compartido `PeriodoGestionFiltro` resuelve cualquier preset a un rango
 * antes de emitir — el wire nunca recibe periodoFiscalId.
 *
 * Nota: el backend DTO acepta `fechaDesde`/`fechaHasta` directamente
 * (no `desde`/`hasta`). No hay traducción de nombres.
 */
export async function getFlujoEfectivo(
  filtros: FlujoEfectivoFiltroValues,
): Promise<EstadoFlujoEfectivoResponse> {
  const res = await api.get<EstadoFlujoEfectivoResponse>('/api/eeff/flujo-efectivo', {
    params: {
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
      ...(filtros.incluirAnulados === true ? { incluirAnulados: true } : {}),
    },
  });
  return res.data;
}
