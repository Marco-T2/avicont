import { api } from '@/lib/api';
import type { ExportarComprobantesParams, ExportarComprobantesResponse } from '@/types/api';

/**
 * Descarga todos los comprobantes que coincidan con los filtros, sin paginar.
 * Se llama en el handler del botón de exportar (on-demand), NO desde TanStack Query cache.
 * El backend limita a COMPROBANTES_EXPORT_MAX (default 1000) comprobantes.
 */
export async function exportComprobantes(
  params: ExportarComprobantesParams = {},
): Promise<ExportarComprobantesResponse> {
  const res = await api.get<ExportarComprobantesResponse>('/api/comprobantes/export', { params });
  return res.data;
}
