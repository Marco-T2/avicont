import type { EstadoAsociacion, ListarDocumentosFisicosParams } from '@/types/api';

export const PAGE_SIZE = 20;

interface FiltrosUI {
  numero?: string;
  tipoDocumentoFisicoId?: string;
  estadoAsociacion?: EstadoAsociacion;
  fechaDesde?: string;
  fechaHasta?: string;
  contactoId?: string;
}

/**
 * Mapea el estado local de filtros de la página al objeto de params
 * que acepta useDocumentosFisicos / getDocumentosFisicos.
 *
 * Reglas de omisión:
 * - numero vacío → se omite
 * - tipoDocumentoFisicoId vacío → se omite
 * - estadoAsociacion/fechas undefined → se omiten
 * - Siempre incluye page y pageSize.
 */
export function buildDocumentosFisicosParams(
  filtros: FiltrosUI,
  page: number,
): ListarDocumentosFisicosParams {
  return {
    ...(filtros.numero && filtros.numero.length > 0 ? { numero: filtros.numero } : {}),
    ...(filtros.tipoDocumentoFisicoId && filtros.tipoDocumentoFisicoId.length > 0
      ? { tipoDocumentoFisicoId: filtros.tipoDocumentoFisicoId }
      : {}),
    ...(filtros.estadoAsociacion !== undefined
      ? { estadoAsociacion: filtros.estadoAsociacion }
      : {}),
    ...(filtros.fechaDesde && filtros.fechaDesde.length > 0
      ? { fechaDesde: filtros.fechaDesde }
      : {}),
    ...(filtros.fechaHasta && filtros.fechaHasta.length > 0
      ? { fechaHasta: filtros.fechaHasta }
      : {}),
    ...(filtros.contactoId && filtros.contactoId.length > 0
      ? { contactoId: filtros.contactoId }
      : {}),
    page,
    pageSize: PAGE_SIZE,
  };
}
