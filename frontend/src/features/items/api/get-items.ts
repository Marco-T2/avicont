import { api } from '@/lib/api';
import type { ItemListResponse, ListarItemsParams } from '@/types/api';

export async function getItems(
  params: ListarItemsParams = {},
): Promise<ItemListResponse> {
  // activo='all' se manda como string literal; boolean se serializa como
  // 'true'/'false' por axios; undefined se omite.
  const res = await api.get<ItemListResponse>('/api/items', { params });
  return res.data;
}
