import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginResponse, StartImpersonationRequest } from '@/types/api';

import { endImpersonation } from '../api/end-impersonation';
import { startImpersonation } from '../api/start-impersonation';

// Inicia una sesión de impersonation: intercambia el access token del admin
// por el impersonationToken del target. El refresh cookie (httpOnly) del
// admin sigue intacto — al terminar, un /api/auth/refresh lo restaura.
export function useStartImpersonation() {
  const setToken = useAuthStore((s) => s.setToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: StartImpersonationRequest) => startImpersonation(body),
    onSuccess: (data) => {
      setToken(data.impersonationToken);
      void queryClient.invalidateQueries();
    },
  });
}

// Cierra la sesión de impersonation y restaura el token del admin usando el
// refresh cookie (que nunca fue tocado). Si el refresh falla (cookie expirada
// o eliminada), limpiamos todo y forzamos login.
export function useEndImpersonation() {
  const setToken = useAuthStore((s) => s.setToken);
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<'restored' | 'logged-out'> => {
      await endImpersonation();
      try {
        const res = await api.post<LoginResponse>('/api/auth/refresh');
        setToken(res.data.accessToken);
        return 'restored';
      } catch {
        clear();
        return 'logged-out';
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}
