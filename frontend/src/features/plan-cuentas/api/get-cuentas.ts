import { api } from '@/lib/api';
import type { CuentaListResponse, ListarCuentasParams } from '@/types/api';

export async function getCuentas(
  params: ListarCuentasParams = {},
): Promise<CuentaListResponse> {
  const res = await api.get<CuentaListResponse>('/api/cuentas', { params });
  return res.data;
}
