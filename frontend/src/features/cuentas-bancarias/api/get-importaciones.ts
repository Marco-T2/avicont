import { api } from '@/lib/api';
import type { ListarImportacionesResponse } from '@/types/api';

export interface ListarImportacionesParams {
  page?: number;
  pageSize?: number;
}

/**
 * GET /api/cuentas-bancarias/:id/importaciones — Historial de extractos
 * importados en la cuenta, más reciente primero.
 *
 * Una importación NO se puede deshacer (`onDelete: Restrict` sobre los
 * movimientos): este historial es el registro de qué archivo entró y cuándo.
 */
export async function getImportaciones(
  cuentaBancariaId: string,
  params: ListarImportacionesParams = {},
): Promise<ListarImportacionesResponse> {
  const res = await api.get<ListarImportacionesResponse>(
    `/api/cuentas-bancarias/${cuentaBancariaId}/importaciones`,
    { params },
  );
  return res.data;
}
