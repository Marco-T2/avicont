import { api } from '@/lib/api';
import type { Item } from '@/types/api';

// DELETE = soft-delete: devuelve el ítem con activo:false. Es reversible
// vía POST /api/items/:id/reactivar (REQ-ITM-01: desactivar, nunca borrar).
export async function desactivarItem(id: string): Promise<Item> {
  const res = await api.delete<Item>(`/api/items/${id}`);
  return res.data;
}
