import { api } from '@/lib/api';

/** DELETE físico — solo válido para ventas en BORRADOR (REQ-VTA-01). */
export async function deleteVenta(id: string): Promise<void> {
  await api.delete(`/api/ventas/${id}`);
}
