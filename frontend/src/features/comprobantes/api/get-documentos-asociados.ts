import { api } from '@/lib/api';
import type { DocumentoFisico } from '@/types/api';

/**
 * GET /api/comprobantes/:id/documentos-fisicos
 * Devuelve la lista de documentos físicos asociados al comprobante.
 */
export async function getDocumentosAsociados(comprobanteId: string): Promise<DocumentoFisico[]> {
  const res = await api.get<DocumentoFisico[]>(
    `/api/comprobantes/${comprobanteId}/documentos-fisicos`,
  );
  return res.data;
}
