import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListarMovimientosBancariosParams } from '@/types/api';

import { getMovimientosBancarios } from '../api/get-movimientos-bancarios';

/**
 * Listado del verificador de movimientos bancarios. Solo dispara cuando hay
 * rango completo — el backend exige `desde`/`hasta` (REQ-VMB-01).
 *
 * `keepPreviousData`: al paginar o cambiar filtros la tabla no parpadea en vacío.
 */
export function useMovimientosBancarios(params: ListarMovimientosBancariosParams | null) {
  return useQuery({
    queryKey: ['movimientos-bancarios', 'list', params],
    queryFn: () => {
      if (params === null) throw new Error('params requeridos para el listado');
      return getMovimientosBancarios(params);
    },
    enabled: params !== null,
    placeholderData: keepPreviousData,
  });
}
