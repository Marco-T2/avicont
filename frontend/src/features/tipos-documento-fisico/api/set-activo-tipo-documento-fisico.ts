import { api } from '@/lib/api';
import type { TipoDocumentoFisico } from '@/types/api';

// Usado por el toggle rápido desde la tabla (sin abrir el form).
// El backend PATCH acepta { activo } en el mismo endpoint que el update.
export async function setActivoTipoDocumentoFisico(
  id: string,
  activo: boolean,
): Promise<TipoDocumentoFisico> {
  const res = await api.patch<TipoDocumentoFisico>(
    `/api/tipos-documento-fisico/${id}`,
    { activo },
  );
  return res.data;
}
