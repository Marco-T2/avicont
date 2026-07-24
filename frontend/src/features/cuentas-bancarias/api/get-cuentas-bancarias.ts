import { api } from '@/lib/api';
import type { ListarCuentasBancariasParams, ListarCuentasBancariasResponse } from '@/types/api';

export async function getCuentasBancarias(
  params: ListarCuentasBancariasParams = {},
): Promise<ListarCuentasBancariasResponse> {
  const res = await api.get<ListarCuentasBancariasResponse>('/api/cuentas-bancarias', { params });
  return res.data;
}
