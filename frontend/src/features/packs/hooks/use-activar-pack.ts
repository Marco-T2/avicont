import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { backendErrorMessage } from '@/lib/error-messages';
import { useAuthStore } from '@/stores/auth-store';

import { activarPack } from '../api/activar-pack';

/**
 * Activa o desactiva un pack habilitado para la organización del Owner.
 *
 * Estrategia: invalidación (no optimistic). El switch refleja `entitlement.activo`
 * del cache; tras la mutation se invalidan ambas queries. En error el switch
 * revierte solo porque el cache no fue tocado optimistamente (D-05).
 *
 * Invalida `['me-permissions']` también para refrescar el nav
 * (useMisPacks lee de ahí).
 */
export function useActivarPack() {
  const qc = useQueryClient();
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);

  return useMutation({
    mutationFn: ({ clave, activo }: { clave: string; activo: boolean }) =>
      activarPack(clave, activo),
    onSuccess: (_data, { activo }) => {
      void qc.invalidateQueries({ queryKey: ['mis-packs-gestion', activeTenantId] });
      void qc.invalidateQueries({ queryKey: ['me-permissions', activeTenantId] });
      toast.success(activo ? 'Complemento activado' : 'Complemento desactivado');
    },
    onError: (err) => {
      toast.error(backendErrorMessage(err, 'No se pudo actualizar el complemento'));
    },
  });
}
