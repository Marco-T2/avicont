import { useQuery } from '@tanstack/react-query';

import { getEstadoCuenta } from '../api/get-estado-cuenta';

// El estado de cuenta es 100% derivado (nada persistido) y su `fechaCorte` sale
// del ClockPort del backend: no se cachea largo ni se deriva "hoy" en el cliente.
export function useEstadoCuenta(contactoId: string | undefined) {
  return useQuery({
    queryKey: ['estado-cuenta', contactoId],
    queryFn: () => getEstadoCuenta(contactoId as string),
    enabled: contactoId !== undefined && contactoId !== '',
  });
}
