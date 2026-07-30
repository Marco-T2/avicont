import { api } from '@/lib/api';
import type { AnularVentaRequest } from '@/types/api';

export async function anularVenta(
  id: string,
  payload: AnularVentaRequest,
): Promise<void> {
  await api.post(`/api/ventas/${id}/anular`, payload);
}
