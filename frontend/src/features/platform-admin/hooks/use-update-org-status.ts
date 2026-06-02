import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';
import type { OrgStatus } from '@/types/api';

import { updateOrgStatus } from '../api/update-org-status';

interface UpdateOrgStatusVars {
  id: string;
  status: OrgStatus;
}

/**
 * Cambia el status de una organización desde el panel de plataforma (super-admin).
 *
 * onSuccess: invalida ['platform-orgs'] (la lista se re-fetchea) + toast de éxito.
 * onError: toast.error con el message del backend. El dialog de confirmación se
 * cierra en el onSuccess del caller (patrón §14.3); en error sigue abierto.
 * Anti-F-13: el toast vive en el hook, no en el cuerpo del componente.
 */
export function useUpdateOrgStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: UpdateOrgStatusVars) => updateOrgStatus(id, { status }),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: ['platform-orgs'] });
      toast.success(`Estado de «${org.name}» actualizado`);
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo cambiar el estado de la organización'));
    },
  });
}
