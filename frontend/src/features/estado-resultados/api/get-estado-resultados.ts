import { api } from '@/lib/api';
import type { EstadoResultadosResponse } from '@/types/api';

import type { EstadoResultadosFiltroValues } from '../schemas/estado-resultados-filtro-schema';

export async function getEstadoResultados(
  filtros: EstadoResultadosFiltroValues,
): Promise<EstadoResultadosResponse> {
  const params: Record<string, string | boolean> = {
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
    incluirAnulados: filtros.incluirAnulados,
  };

  const res = await api.get<EstadoResultadosResponse>('/api/eeff/resultados', { params });
  return res.data;
}
