import { useQuery } from '@tanstack/react-query';

import { getComprobante } from '../api/get-comprobante';

export function useComprobante(id: string) {
  return useQuery({
    queryKey: ['comprobantes', 'detail', id],
    queryFn: () => getComprobante(id),
    enabled: id !== '',
  });
}
