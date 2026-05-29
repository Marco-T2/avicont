import { api } from '@/lib/api';
import type { TipoDocumentoFisico, UpdateTipoDocumentoFisicoRequest } from '@/types/api';

import type { TipoDocumentoFisicoFormValues } from '../schemas/tipo-documento-fisico-form-schema';

// codigo NO va en el PATCH — es inmutable post-creación.
// activo del form edit SÍ se envía (el backend aplica setActivo primero, luego update).
export async function updateTipoDocumentoFisico(
  id: string,
  values: TipoDocumentoFisicoFormValues,
): Promise<TipoDocumentoFisico> {
  const body: UpdateTipoDocumentoFisicoRequest = {
    nombre: values.nombre,
    esTributario: values.esTributario,
    tiposComprobanteAplicables: values.tiposComprobanteAplicables,
    activo: values.activo,
  };
  const res = await api.patch<TipoDocumentoFisico>(
    `/api/tipos-documento-fisico/${id}`,
    body,
  );
  return res.data;
}
