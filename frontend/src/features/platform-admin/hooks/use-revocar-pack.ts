import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';

import { revocarPack } from '../api/revocar-pack';

interface RevocarPackVars {
  orgId: string;
  packId: string;
}

/**
 * Revoca el entitlement de un pack para una org (super-admin).
 * Invalida ['platform-org-packs', orgId] en éxito.
 * Toast en el hook (Anti-F-13). Acción reversible → NO variant destructive (§14.4).
 */
export function useRevocarPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, packId }: RevocarPackVars) => revocarPack(orgId, packId),
    onSuccess: (_data, { orgId }) => {
      void queryClient.invalidateQueries({ queryKey: ['platform-org-packs', orgId] });
      toast.success('Pack revocado');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo revocar el pack'));
    },
  });
}
