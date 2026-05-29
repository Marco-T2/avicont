import { api } from '@/lib/api';
import type { CreateDocumentoFisicoRequest, DocumentoFisico } from '@/types/api';

export async function createDocumentoFisico(
  body: CreateDocumentoFisicoRequest,
): Promise<DocumentoFisico> {
  const res = await api.post<DocumentoFisico>('/api/documentos-fisicos', body);
  return res.data;
}
