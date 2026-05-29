import { api } from '@/lib/api';

export async function eliminarDocumentoFisico(id: string): Promise<void> {
  await api.delete(`/api/documentos-fisicos/${id}`);
}
