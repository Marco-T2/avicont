import { useQuery } from '@tanstack/react-query';

import { getContactoDetail } from '../api/get-contacto-detail';

// id puede ser null cuando el drawer/panel está cerrado — en ese caso la query
// queda disabled y no dispara request.
export function useContactoDetail(id: string | null) {
  return useQuery({
    queryKey: ['contactos', 'detalle', id],
    queryFn: () => {
      if (id === null) throw new Error('id is null — query should be disabled');
      return getContactoDetail(id);
    },
    enabled: id !== null,
  });
}
