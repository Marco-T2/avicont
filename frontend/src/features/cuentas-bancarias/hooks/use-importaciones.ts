import { useQuery } from '@tanstack/react-query';

import { getImportaciones, type ListarImportacionesParams } from '../api/get-importaciones';

/**
 * Historial de importaciones de una cuenta bancaria.
 * Solo dispara cuando hay una cuenta seleccionada (drawer abierto).
 *
 * El default del backend es 50 por página, demasiado para el alto de un drawer:
 * el caller pasa un `pageSize` chico y pagina.
 */
export function useImportaciones(
  cuentaBancariaId: string | null,
  params: ListarImportacionesParams = {},
) {
  return useQuery({
    queryKey: ['cuentas-bancarias', 'importaciones', cuentaBancariaId, params],
    queryFn: () => {
      if (cuentaBancariaId === null) throw new Error('cuentaBancariaId requerido');
      return getImportaciones(cuentaBancariaId, params);
    },
    enabled: cuentaBancariaId !== null,
  });
}
