import { api } from '@/lib/api';
import type { DocumentoFisicoListResponse, ListarDocumentosFisicosParams } from '@/types/api';

export async function getDocumentosFisicos(
  params: ListarDocumentosFisicosParams = {},
): Promise<DocumentoFisicoListResponse> {
  const res = await api.get<DocumentoFisicoListResponse>('/api/documentos-fisicos', {
    params,
  });
  return res.data;
}
