import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';
import type { UpdateEntitlementRequest } from '@/types/api';

import { updateEntitlement } from '../api/update-entitlement';

interface UpdateEntitlementVars {
  id: string;
  body: UpdateEntitlementRequest;
}

/**
 * Actualiza el plan y/o verticales de una organización (super-admin).
 *
 * onSuccess: invalida ['platform-orgs'] + toast de éxito.
 * onError: toast.error con el message del backend (incluye el 422
 * PLATFORM_VERTICAL_NO_EXCLUSIVO, ya en español). El Sheet NO se cierra acá —
 * el caller lo cierra en su onSuccess para que en error el form siga abierto.
 * Anti-F-13: el toast vive en el hook.
 */
export function useUpdateEntitlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: UpdateEntitlementVars) => updateEntitlement(id, body),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: ['platform-orgs'] });
      toast.success(`Entitlement de «${org.name}» actualizado`);
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo actualizar el entitlement'));
    },
  });
}
