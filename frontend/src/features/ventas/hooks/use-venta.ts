import { useQuery } from '@tanstack/react-query';

import { getVenta } from '../api/get-venta';

export function useVenta(id: string) {
  return useQuery({
    queryKey: ['ventas', 'detail', id],
    queryFn: () => getVenta(id),
    enabled: id !== '',
  });
}
