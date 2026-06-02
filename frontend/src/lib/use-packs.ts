import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';

import { getMePermissions } from './me-permissions';

/**
 * Packs activos de la org del tenant actual, leídos del MISMO cache que
 * usePermissions / useVerticalActivo (queryKey ['me-permissions', activeTenantId])
 * → cero red extra. TanStack deduplica por queryKey: una sola request HTTP aunque
 * los tres hooks corran.
 *
 * Distinción de estados (fail-closed, igual que useVerticalActivo):
 * - packsActivos === undefined → cargando / sin data → ocultar ítems con `pack`
 * - packsActivos === []        → org sin packs activos → ocultar ítems con `pack`
 * - packsActivos === ['x', …]  → claves de packs activos resueltas
 *
 * Server state → vive en Query, NUNCA en Zustand (Anti-F-05).
 */
export function useMisPacks(): {
  packsActivos: string[] | undefined;
  isLoading: boolean;
} {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);

  const query = useQuery({
    queryKey: ['me-permissions', activeTenantId],
    queryFn: getMePermissions,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // Deshabilitada si no hay token o no hay tenant activo — mismo guard que usePermissions.
    enabled: Boolean(accessToken) && Boolean(activeTenantId),
  });

  return {
    // undefined = indeterminado (cargando o sin data). NO asumir [] → fail-closed.
    packsActivos: query.data?.packsActivos,
    isLoading: query.isLoading,
  };
}
