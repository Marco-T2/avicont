import { api } from '@/lib/api';
import type { Contacto } from '@/types/api';

export async function desactivarContacto(id: string): Promise<Contacto> {
  const res = await api.post<Contacto>(`/api/contactos/${id}/desactivar`);
  return res.data;
}
