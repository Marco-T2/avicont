import { api } from '@/lib/api';
import type { LibroDiarioParams, LibroDiarioResponse } from '@/types/api';

/**
 * GET /api/libros/diario — Consulta el Libro Diario del tenant activo.
 *
 * El backend requiere exactamente uno de:
 * (a) periodoFiscalId
 * (b) fechaDesde + fechaHasta
 *
 * REQ-LD-01: si no se cumple, el backend responde 400 LIBRO_DIARIO_FILTRO_INVALIDO.
 * REQ-LD-09: requiere permiso contabilidad.libro-diario.read (403 si falta).
 * REQ-LD-10: si el rango supera 5.000 asientos → 422 LIBRO_DIARIO_RANGO_EXCEDIDO.
 */
export async function getLibroDiario(
  params: LibroDiarioParams,
): Promise<LibroDiarioResponse> {
  const res = await api.get<LibroDiarioResponse>('/api/libros/diario', {
    params: {
      ...(params.cuentaId !== undefined ? { cuentaId: params.cuentaId } : {}),
      ...(params.periodoFiscalId !== undefined
        ? { periodoFiscalId: params.periodoFiscalId }
        : {}),
      ...(params.fechaDesde !== undefined ? { fechaDesde: params.fechaDesde } : {}),
      ...(params.fechaHasta !== undefined ? { fechaHasta: params.fechaHasta } : {}),
      ...(params.incluirAnulados === true ? { incluirAnulados: true } : {}),
    },
  });
  return res.data;
}
