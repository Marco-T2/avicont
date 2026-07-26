import { useQuery } from '@tanstack/react-query';

import { getHistorialArranques } from '../api/get-historial-arranques';

/**
 * Historial completo de declaraciones de arranque de una cuenta bancaria
 * (REQ-ICB-04, D8). Solo dispara con una cuenta elegida.
 *
 * El orden ya viene con el desempate de `vigenteA` (`fecha DESC, createdAt
 * DESC`): la declaración que aplica a un corte es la PRIMERA fila con
 * `fecha <= corte` — la vista la señala sin re-ordenar.
 */
export function useHistorialArranques(cuentaBancariaId: string | null) {
  return useQuery({
    queryKey: ['informe-conciliacion', 'arranques', cuentaBancariaId],
    queryFn: () => {
      if (cuentaBancariaId === null) throw new Error('cuentaBancariaId requerido');
      return getHistorialArranques(cuentaBancariaId);
    },
    enabled: cuentaBancariaId !== null,
  });
}
