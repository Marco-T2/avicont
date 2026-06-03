import { useQuery } from '@tanstack/react-query';

import { getPlatformDashboard } from '../api/get-platform-dashboard';

/**
 * KPIs del dashboard de plataforma (super-admin).
 *
 * queryKey ['platform-dashboard'] — org-less, cross-tenant. staleTime alto
 * (60 s) porque los KPIs globales son estables en el tiempo corto.
 */
export function usePlatformDashboard() {
  return useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: getPlatformDashboard,
    staleTime: 60_000,
  });
}
