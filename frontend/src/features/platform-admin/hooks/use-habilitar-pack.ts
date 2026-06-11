import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';

import { habilitarPack } from '../api/habilitar-pack';

interface HabilitarPackVars {
  orgId: string;
  clave: string;
}

/**
 * Habilita un pack para una org (super-admin).
 * Invalida ['platform-org-packs', orgId] en éxito para reflejar el nuevo entitlement.
 * Toast en el hook (Anti-F-13). El catálogo global no cambia → no se invalida.
 */
export function useHabilitarPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, clave }: HabilitarPackVars) => habilitarPack(orgId, clave),
    onSuccess: (_data, { orgId }) => {
      void queryClient.invalidateQueries({ queryKey: ['platform-org-packs', orgId] });
      toast.success('Pack habilitado');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo habilitar el pack'));
    },
  });
}
