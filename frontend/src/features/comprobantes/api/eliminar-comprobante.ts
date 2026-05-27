import { api } from '@/lib/api';

export async function eliminarComprobante(id: string): Promise<void> {
  // DELETE /api/comprobantes/:id → 204 No Content (solo para BORRADOR).
  await api.delete(`/api/comprobantes/${id}`);
}
