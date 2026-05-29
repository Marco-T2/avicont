import { api } from '@/lib/api';

/**
 * POST /api/comprobantes/:id/documentos-fisicos
 * Asocia uno o más documentos físicos al comprobante. Operación aditiva e idempotente.
 * Body: { documentoFisicoIds: string[] } (máx 50)
 */
export async function asociarDocumentos(
  comprobanteId: string,
  documentoFisicoIds: string[],
): Promise<void> {
  await api.post(`/api/comprobantes/${comprobanteId}/documentos-fisicos`, {
    documentoFisicoIds,
  });
}
