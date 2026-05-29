import { api } from '@/lib/api';
import type { DocumentoFisicoDetalle } from '@/types/api';

export async function getDocumentoFisicoDetalle(id: string): Promise<DocumentoFisicoDetalle> {
  const res = await api.get<DocumentoFisicoDetalle>(`/api/documentos-fisicos/${id}`);
  return res.data;
}
