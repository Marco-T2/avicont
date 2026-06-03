import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { broadcastLogout } from '@/lib/auth-channel';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Acción de cierre de sesión, compartida por todos los shells.
 *
 * Revoca el refresh token en el backend, limpia el estado en memoria, avisa a
 * las demás pestañas (multi-tab, §10.10) y redirige a /login. El backend se
 * llama best-effort: aun si falla, limpiamos localmente — al próximo request
 * el usuario quedaría logged out de todas formas.
 */
export function useLogout(): () => Promise<void> {
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();

  return async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Silencioso: aun si el backend rechaza, limpiamos en memoria.
    }
    clear();
    broadcastLogout();
    toast.success('Sesión cerrada');
    navigate('/login', { replace: true });
  };
}
