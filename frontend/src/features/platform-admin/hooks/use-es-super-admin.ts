import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';

import { getMePlatform } from '../api/get-me-platform';

/**
 * Identidad de plataforma del usuario: ¿es super-admin?
 *
 * queryKey ['me-platform'] SIN activeTenantId — es identidad de plataforma,
 * no de tenant. Un switch de tenant NO la invalida.
 * enabled: Boolean(accessToken) — basta el token; funciona para el super-admin
 * SIN tenant activo (caso que usePermissions no cubre).
 * Fail-closed: sin data (cargando, error, revocado) → esSuperAdmin false.
 * Server-authoritative: si el backend revoca el claim, la query falla → false.
 */
export function useEsSuperAdmin(): { esSuperAdmin: boolean; isLoading: boolean } {
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['me-platform'],
    queryFn: getMePlatform,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(accessToken),
  });

  return {
    esSuperAdmin: query.data?.isSuperAdmin ?? false,
    isLoading: query.isLoading,
  };
}
