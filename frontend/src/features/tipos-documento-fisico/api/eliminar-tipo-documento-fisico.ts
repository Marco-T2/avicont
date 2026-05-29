import { api } from '@/lib/api';

// Fuera de scope slice 1 — no se expone en UI (REQ-TDF-05).
// La función existe para uso futuro o via scripts de administración,
// pero ningún componente la importa ni hay botón de eliminar en la UI.
export async function eliminarTipoDocumentoFisico(id: string): Promise<void> {
  await api.delete(`/api/tipos-documento-fisico/${id}`);
}
