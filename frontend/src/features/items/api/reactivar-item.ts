import { api } from '@/lib/api';
import type { Item } from '@/types/api';

// Idempotente: reactivar un ítem ya activo devuelve el mismo ítem.
export async function reactivarItem(id: string): Promise<Item> {
  const res = await api.post<Item>(`/api/items/${id}/reactivar`);
  return res.data;
}
