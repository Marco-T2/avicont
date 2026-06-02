import { useQuery } from '@tanstack/react-query';

import { getOrgs } from '../api/get-orgs';

/**
 * Lista de organizaciones de la plataforma (super-admin).
 *
 * queryKey ['platform-orgs'] — org-less, no depende del tenant activo. La feature
 * de plataforma opera cross-tenant. Las mutaciones de PR-2/PR-3 invalidan esta key.
 */
export function useOrgs() {
  return useQuery({
    queryKey: ['platform-orgs'],
    queryFn: getOrgs,
  });
}
