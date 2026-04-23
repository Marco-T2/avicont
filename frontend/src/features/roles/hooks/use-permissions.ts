import { useQuery } from '@tanstack/react-query';

import { getPermissionsGrouped } from '../api/get-permissions-grouped';

export function usePermissionsGrouped() {
  return useQuery({
    queryKey: ['permissions', 'grouped'],
    queryFn: getPermissionsGrouped,
    // El catálogo es estático, casi nunca cambia.
    staleTime: 1000 * 60 * 60,
  });
}
