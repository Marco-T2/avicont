import { api } from '@/lib/api';
import type { ContactoListResponse, ListarContactosParams } from '@/types/api';

export async function getContactos(
  params: ListarContactosParams = {},
): Promise<ContactoListResponse> {
  // activo='all' se manda como string literal; boolean se serializa como
  // 'true'/'false' por axios; undefined se omite (axios ignora undefined).
  const res = await api.get<ContactoListResponse>('/api/contactos', { params });
  return res.data;
}
