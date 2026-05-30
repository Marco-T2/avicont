import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { LibroDiarioParams } from '@/types/api';

import { getLibroDiario } from '../api/get-libro-diario';

/**
 * Hook de TanStack Query para el Libro Diario.
 *
 * Solo dispara la query cuando `params` tiene al menos un filtro válido
 * (periodoFiscalId O la dupla fechaDesde+fechaHasta), para no enviar una
 * request sin filtros al cargar la página (REQ-LD-01).
 *
 * `keepPreviousData`: al cambiar filtros la UI no parpadea en vacío,
 * muestra la data anterior hasta que llega la nueva.
 */
export function useLibroDiario(params: LibroDiarioParams) {
  const enabled =
    params.periodoFiscalId !== undefined ||
    (params.fechaDesde !== undefined && params.fechaHasta !== undefined);

  return useQuery({
    queryKey: ['libros', 'diario', params],
    queryFn: () => getLibroDiario(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}
