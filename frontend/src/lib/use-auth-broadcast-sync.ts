import { useEffect } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/stores/auth-store';

import { onLogoutFromOtherTab } from './auth-channel';

/**
 * Sincroniza el cierre de sesión entre pestañas del mismo navegador (§10.10).
 *
 * Cuando otra pestaña cierra sesión, limpia el store de esta. No navega: el
 * ProtectedRoute redirige a /login reactivamente al ver accessToken === null.
 * Se monta una sola vez en la raíz de la app.
 */
export function useAuthBroadcastSync(): void {
  useEffect(() => {
    return onLogoutFromOtherTab(() => {
      // Si esta pestaña ya estaba sin sesión (ej. en /login), no hay nada que
      // limpiar ni por qué mostrar un aviso.
      if (useAuthStore.getState().accessToken === null) return;
      useAuthStore.getState().clear();
      toast.info('Tu sesión se cerró en otra pestaña');
    });
  }, []);
}
