import { api } from '@/lib/api';
import type { LibroMayorParams, LibroMayorResponse } from '@/types/api';

/**
 * GET /api/libros/mayor — Consulta el Libro Mayor del tenant activo.
 *
 * El filtro siempre es un rango de fechas (fechaDesde + fechaHasta).
 * El componente compartido `PeriodoGestionFiltro` resuelve cualquier preset
 * a un rango antes de emitir — el wire nunca recibe periodoFiscalId.
 *
 * REQ-LM-01: si no se cumple, el backend responde 400 LIBRO_MAYOR_FILTRO_INVALIDO.
 * REQ-LM-09: requiere permiso contabilidad.libro-mayor.read (403 si falta).
 * Si el rango supera el tope de movimientos → 422 LIBRO_MAYOR_RANGO_EXCEDIDO.
 */
export async function getLibroMayor(
  params: LibroMayorParams,
): Promise<LibroMayorResponse> {
  const res = await api.get<LibroMayorResponse>('/api/libros/mayor', {
    params: {
      ...(params.cuentaId !== undefined ? { cuentaId: params.cuentaId } : {}),
      ...(params.fechaDesde !== undefined ? { fechaDesde: params.fechaDesde } : {}),
      ...(params.fechaHasta !== undefined ? { fechaHasta: params.fechaHasta } : {}),
      ...(params.incluirAnulados === true ? { incluirAnulados: true } : {}),
      // soloConMovimiento default backend = true; solo enviamos cuando es false.
      ...(params.soloConMovimiento === false ? { soloConMovimiento: false } : {}),
    },
  });
  return res.data;
}
