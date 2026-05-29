import { api } from '@/lib/api';
import type { CreateTipoDocumentoFisicoRequest, TipoDocumentoFisico } from '@/types/api';

import type { TipoDocumentoFisicoFormValues } from '../schemas/tipo-documento-fisico-form-schema';

// activo NO va en CreateRequest — el backend lo inicializa en true.
export async function createTipoDocumentoFisico(
  values: TipoDocumentoFisicoFormValues,
): Promise<TipoDocumentoFisico> {
  const body: CreateTipoDocumentoFisicoRequest = {
    nombre: values.nombre,
    codigo: values.codigo,
    esTributario: values.esTributario,
    tiposComprobanteAplicables: values.tiposComprobanteAplicables,
  };
  const res = await api.post<TipoDocumentoFisico>('/api/tipos-documento-fisico', body);
  return res.data;
}
