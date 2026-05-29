import { api } from '@/lib/api';
import type { DocumentoFisico, UpdateDocumentoFisicoRequest } from '@/types/api';

export async function updateDocumentoFisico(
  id: string,
  body: UpdateDocumentoFisicoRequest,
): Promise<DocumentoFisico> {
  const res = await api.patch<DocumentoFisico>(`/api/documentos-fisicos/${id}`, body);
  return res.data;
}
