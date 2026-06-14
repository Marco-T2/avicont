import { api } from '@/lib/api';
import type { CreateTipoDocumentoFisicoRequest, TipoDocumentoFisico } from '@/types/api';

import type { TipoDocumentoFisicoFormValues } from '../schemas/tipo-documento-fisico-form-schema';

// activo NO va en CreateRequest — el backend lo inicializa en true.
// numeracionAutomatica y numeroInicial son set-once: se envían solo en create.
export async function createTipoDocumentoFisico(
  values: TipoDocumentoFisicoFormValues,
): Promise<TipoDocumentoFisico> {
  const body: CreateTipoDocumentoFisicoRequest = {
    nombre: values.nombre,
    codigo: values.codigo,
    esTributario: values.esTributario,
    tiposComprobanteAplicables: values.tiposComprobanteAplicables,
    ...(values.numeracionAutomatica
      ? {
          numeracionAutomatica: true,
          // api.generated emite numeroInicial como number en CreateDto.
          // Si el usuario no lo especificó, el backend defaultea a 1.
          ...(values.numeroInicial !== null
            ? { numeroInicial: values.numeroInicial }
            : {}),
        }
      : {}),
  };
  const res = await api.post<TipoDocumentoFisico>('/api/tipos-documento-fisico', body);
  return res.data;
}
