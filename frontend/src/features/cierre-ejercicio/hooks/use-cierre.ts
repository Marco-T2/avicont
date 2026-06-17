import { useQuery } from '@tanstack/react-query';

import { getCierre } from '../api/get-cierre';

export function useCierre(gestionId: string | undefined) {
  return useQuery({
    queryKey: ['cierre-ejercicio', gestionId],
    queryFn: () => getCierre(gestionId!),
    enabled: gestionId !== undefined && gestionId !== '',
  });
}
