import { useQuery } from '@tanstack/react-query';

import { getCuentaDetail } from '../api/get-cuenta-detail';

// id puede ser null cuando el drawer está cerrado — en ese caso la query
// queda disabled y no dispara request.
export function useCuentaDetail(id: string | null) {
  return useQuery({
    queryKey: ['cuentas', 'detalle', id],
    queryFn: () => {
      if (id === null) throw new Error('id is null — query should be disabled');
      return getCuentaDetail(id);
    },
    enabled: id !== null,
  });
}
