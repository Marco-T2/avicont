import { useQuery } from '@tanstack/react-query';

import { getOrgPacks } from '../api/get-org-packs';

/**
 * Entitlements de packs habilitados para una org específica (super-admin).
 * Query key: ['platform-org-packs', orgId]
 * Solo se ejecuta si orgId !== null (el sheet puede estar cerrado).
 */
export function useOrgPacks(orgId: string | null) {
  return useQuery({
    queryKey: ['platform-org-packs', orgId],
    queryFn: () => getOrgPacks(orgId as string),
    enabled: orgId !== null,
  });
}
