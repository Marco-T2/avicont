import { api } from '@/lib/api';
import type { Contacto } from '@/types/api';

export async function reactivarContacto(id: string): Promise<Contacto> {
  const res = await api.post<Contacto>(`/api/contactos/${id}/reactivar`);
  return res.data;
}
