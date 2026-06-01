// Capa de request para el módulo granja — 15 endpoints.
// CLAUDE.md §8: toda request va vía `api` (interceptor Bearer + 401 refresh).
// Patrón: una función por endpoint, types en granja.types.ts.

import { api } from '@/lib/api';

import type {
  CreateLoteRequest,
  CreateMovimientoCantidadRequest,
  CreateMovimientoInversionRequest,
  CreateTipoRegistroRequest,
  ListarLotesParams,
  ListarLotesResponse,
  ListarTiposRegistroParams,
  LoteDashboardItem,
  LoteResponse,
  MovimientosResponse,
  TipoRegistroResponse,
  UpdateLoteRequest,
  UpdateTipoRegistroRequest,
} from './granja.types';

// ─── Dashboard ─────────────────────────────────────────────────────────────────

/** 1. GET /api/granja/dashboard — lista de lotes ACTIVOS con resumen */
export async function getDashboard(): Promise<LoteDashboardItem[]> {
  const res = await api.get<LoteDashboardItem[]>('/api/granja/dashboard');
  return res.data;
}

// ─── Lotes ─────────────────────────────────────────────────────────────────────

/** 2. POST /api/granja/lotes — crear un lote nuevo */
export async function createLote(body: CreateLoteRequest): Promise<LoteResponse> {
  const res = await api.post<LoteResponse>('/api/granja/lotes', body);
  return res.data;
}

/** 3. GET /api/granja/lotes?estado=&page=&pageSize= — lista paginada */
export async function getLotes(params: ListarLotesParams = {}): Promise<ListarLotesResponse> {
  const res = await api.get<ListarLotesResponse>('/api/granja/lotes', { params });
  return res.data;
}

/** 4. GET /api/granja/lotes/:id — detalle completo con resumen */
export async function getLote(id: string): Promise<LoteResponse> {
  const res = await api.get<LoteResponse>(`/api/granja/lotes/${id}`);
  return res.data;
}

/** 5. PATCH /api/granja/lotes/:id — actualizar campos mutables */
export async function updateLote(id: string, body: UpdateLoteRequest): Promise<LoteResponse> {
  const res = await api.patch<LoteResponse>(`/api/granja/lotes/${id}`, body);
  return res.data;
}

/** 6. POST /api/granja/lotes/:id/cerrar — cerrar un lote activo */
export async function cerrarLote(id: string): Promise<LoteResponse> {
  const res = await api.post<LoteResponse>(`/api/granja/lotes/${id}/cerrar`);
  return res.data;
}

// ─── Tipos de registro ─────────────────────────────────────────────────────────

/** 7. GET /api/granja/tipos-registro?naturaleza=&activo= */
export async function getTiposRegistro(
  params: ListarTiposRegistroParams = {},
): Promise<TipoRegistroResponse[]> {
  const res = await api.get<TipoRegistroResponse[]>('/api/granja/tipos-registro', { params });
  return res.data;
}

/** 8. POST /api/granja/tipos-registro — crear tipo personalizado */
export async function createTipoRegistro(
  body: CreateTipoRegistroRequest,
): Promise<TipoRegistroResponse> {
  const res = await api.post<TipoRegistroResponse>('/api/granja/tipos-registro', body);
  return res.data;
}

/** 9. PATCH /api/granja/tipos-registro/:id — actualizar nombre o toggle activo */
export async function updateTipoRegistro(
  id: string,
  body: UpdateTipoRegistroRequest,
): Promise<TipoRegistroResponse> {
  const res = await api.patch<TipoRegistroResponse>(`/api/granja/tipos-registro/${id}`, body);
  return res.data;
}

/** 10. DELETE /api/granja/tipos-registro/:id — eliminar tipo (no sistema, sin movimientos) */
export async function deleteTipoRegistro(id: string): Promise<void> {
  await api.delete(`/api/granja/tipos-registro/${id}`);
}

// ─── Movimientos ───────────────────────────────────────────────────────────────

/** 11. POST /api/granja/lotes/:id/movimientos/inversion */
export async function createMovimientoInversion(
  loteId: string,
  body: CreateMovimientoInversionRequest,
): Promise<import('./granja.types').MovimientoInversionResponse> {
  const res = await api.post<import('./granja.types').MovimientoInversionResponse>(
    `/api/granja/lotes/${loteId}/movimientos/inversion`,
    body,
  );
  return res.data;
}

/** 12. POST /api/granja/lotes/:id/movimientos/cantidad */
export async function createMovimientoCantidad(
  loteId: string,
  body: CreateMovimientoCantidadRequest,
): Promise<import('./granja.types').MovimientoCantidadResponse> {
  const res = await api.post<import('./granja.types').MovimientoCantidadResponse>(
    `/api/granja/lotes/${loteId}/movimientos/cantidad`,
    body,
  );
  return res.data;
}

/** 13. GET /api/granja/lotes/:id/movimientos */
export async function getMovimientos(loteId: string): Promise<MovimientosResponse> {
  const res = await api.get<MovimientosResponse>(
    `/api/granja/lotes/${loteId}/movimientos`,
  );
  return res.data;
}

/** 14. DELETE /api/granja/lotes/:id/movimientos/inversion/:movId */
export async function deleteMovimientoInversion(loteId: string, movId: string): Promise<void> {
  await api.delete(`/api/granja/lotes/${loteId}/movimientos/inversion/${movId}`);
}

/** 15. DELETE /api/granja/lotes/:id/movimientos/cantidad/:movId */
export async function deleteMovimientoCantidad(loteId: string, movId: string): Promise<void> {
  await api.delete(`/api/granja/lotes/${loteId}/movimientos/cantidad/${movId}`);
}
