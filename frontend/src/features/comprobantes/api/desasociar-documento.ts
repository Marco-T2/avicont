import { api } from '@/lib/api';

/**
 * DELETE /api/comprobantes/:id/documentos-fisicos/:documentoFisicoId
 * Desasocia un documento físico del comprobante. Responde 204.
 */
export async function desasociarDocumento(
  comprobanteId: string,
  documentoFisicoId: string,
): Promise<void> {
  await api.delete(
    `/api/comprobantes/${comprobanteId}/documentos-fisicos/${documentoFisicoId}`,
  );
}
