import { useQuery } from '@tanstack/react-query';

import { getMyProfile } from '../api/get-my-profile';

// Perfil del user con sus memberships. Cambia poco — 5 min de stale.
// Clave agrupada por "me" para invalidar fácil post-switch-tenant o
// post-accept-invitation.
export function useMyProfile() {
  return useQuery({
    queryKey: ['me'],
    queryFn: getMyProfile,
    staleTime: 5 * 60_000,
  });
}
