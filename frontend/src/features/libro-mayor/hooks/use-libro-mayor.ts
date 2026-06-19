import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { LibroMayorParams } from '@/types/api';

import { getLibroMayor } from '../api/get-libro-mayor';

/**
 * Hook de TanStack Query para el Libro Mayor.
 *
 * Solo dispara la query cuando `params` tiene fechaDesde y fechaHasta no vacíos
 * (truthy check), para no enviar una request sin filtros al cargar la página (REQ-LM-01).
 *
 * `keepPreviousData`: al cambiar filtros la UI no parpadea en vacío,
 * muestra la data anterior hasta que llega la nueva.
 */
export function useLibroMayor(params: LibroMayorParams) {
  const enabled = Boolean(params.fechaDesde && params.fechaHasta);

  return useQuery({
    queryKey: ['libros', 'mayor', params],
    queryFn: () => getLibroMayor(params),
    enabled,
    placeholderData: keepPreviousData,
  });
}
