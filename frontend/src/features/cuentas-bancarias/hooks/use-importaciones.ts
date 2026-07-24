import { useQuery } from '@tanstack/react-query';

import { getImportaciones } from '../api/get-importaciones';

/**
 * Historial de importaciones de una cuenta bancaria.
 * Solo dispara cuando hay una cuenta seleccionada (drawer abierto).
 */
export function useImportaciones(cuentaBancariaId: string | null) {
  return useQuery({
    queryKey: ['cuentas-bancarias', 'importaciones', cuentaBancariaId],
    queryFn: () => {
      if (cuentaBancariaId === null) throw new Error('cuentaBancariaId requerido');
      return getImportaciones(cuentaBancariaId);
    },
    enabled: cuentaBancariaId !== null,
  });
}
