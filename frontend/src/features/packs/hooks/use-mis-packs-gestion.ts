import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';

import { getMisPacks } from '../api/get-mis-packs';

/**
 * Carga TODOS los entitlements de la org con su flag `activo` para la
 * pantalla de gestión del Owner.
 *
 * NO reutiliza `lib/use-packs.ts` (`useMisPacks`): ese hook lee solo las
 * claves activas de `me-permissions` para el nav. Esta pantalla necesita el
 * GET /api/packs/mis-packs completo (habilitados, activos e inactivos).
 * Query key NUEVA `['mis-packs-gestion', activeTenantId]`.
 */
export function useMisPacksGestion() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);

  return useQuery({
    queryKey: ['mis-packs-gestion', activeTenantId],
    queryFn: getMisPacks,
    enabled: Boolean(accessToken) && Boolean(activeTenantId),
  });
}
