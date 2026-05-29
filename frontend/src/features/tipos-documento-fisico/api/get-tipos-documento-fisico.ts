import { api } from '@/lib/api';
import type {
  ListarTiposDocumentoFisicoParams,
  TipoDocumentoFisicoListResponse,
} from '@/types/api';

export async function getTiposDocumentoFisico(
  params: ListarTiposDocumentoFisicoParams = {},
): Promise<TipoDocumentoFisicoListResponse> {
  // activo='all' se manda como string literal; boolean se serializa como
  // 'true'/'false' por axios; undefined se omite (axios ignora undefined).
  const res = await api.get<TipoDocumentoFisicoListResponse>(
    '/api/tipos-documento-fisico',
    { params },
  );
  return res.data;
}
