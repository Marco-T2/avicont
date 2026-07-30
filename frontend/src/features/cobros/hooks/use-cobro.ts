import { useQuery } from '@tanstack/react-query';

import { getCobro } from '../api/get-cobro';

export function useCobro(id: string) {
  return useQuery({
    queryKey: ['cobros', 'detail', id],
    queryFn: () => getCobro(id),
    enabled: id !== '',
  });
}
