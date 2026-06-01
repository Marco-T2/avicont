import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';
import type { VerticalActivo } from '@/types/api';

import { getMePermissions } from './me-permissions';

/**
 * Vertical activo de la org del tenant actual, leído del MISMO cache que
 * usePermissions (queryKey ['me-permissions', activeTenantId]) → cero red extra.
 * TanStack deduplica por queryKey: una sola request HTTP aunque ambos hooks corran.
 *
 * Distinción crítica de estados:
 * - vertical === undefined → cargando / sin data → fail-closed (skeleton, ocultar ítems)
 * - vertical === null     → org sin módulo → flujo de activación (/settings/features)
 * - vertical === 'CONTABILIDAD' | 'GRANJA' → vertical resuelto
 *
 * Server state → vive en Query, NUNCA en Zustand (Anti-F-05).
 */
export function useVerticalActivo(): {
  vertical: VerticalActivo | undefined;
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
    // undefined = indeterminado (cargando o sin data). NO asumir default.
    vertical: query.data?.vertical,
    isLoading: query.isLoading,
  };
}
