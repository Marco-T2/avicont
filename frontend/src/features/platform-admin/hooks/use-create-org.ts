import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';
import type { CreateOrgRequest } from '@/types/api';

import { createOrg } from '../api/create-org';

/**
 * Crea una organización desde el panel de plataforma (super-admin).
 *
 * onSuccess: invalida ['platform-orgs'] (la lista se re-fetchea) + toast de éxito.
 * onError: toast.error con el message del backend. El form NO se cierra acá — el
 * caller mantiene el Sheet abierto en error (ej. 422 ownerEmail inexistente) para
 * que el usuario corrija el email. Anti-F-13: el toast vive en el hook, no en el
 * cuerpo del componente.
 */
export function useCreateOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrgRequest) => createOrg(body),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: ['platform-orgs'] });
      toast.success(`Organización «${org.name}» creada correctamente`);
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo crear la organización'));
    },
  });
}
