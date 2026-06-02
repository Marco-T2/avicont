import { useQuery } from '@tanstack/react-query';

import { getOrgMembers } from '../api/get-org-members';

/**
 * Miembros de una organización (activos + desactivados) para el panel super-admin.
 *
 * queryKey ['platform', 'org-members', id] — org-less, cross-tenant.
 *
 * REQ-PM-01/02 — Slice 1 del change platform-admin-v1.1.
 */
export function useOrgMembers(orgId: string) {
  return useQuery({
    queryKey: ['platform', 'org-members', orgId],
    queryFn: () => getOrgMembers(orgId),
  });
}
