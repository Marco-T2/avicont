import { api } from '@/lib/api';
import type { Contacto } from '@/types/api';

export async function getContactoDetail(id: string): Promise<Contacto> {
  const res = await api.get<Contacto>(`/api/contactos/${id}`);
  return res.data;
}
