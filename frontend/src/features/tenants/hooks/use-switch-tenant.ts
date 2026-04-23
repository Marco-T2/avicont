import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';

import { switchTenant } from '../api/switch-tenant';

// Cambiar de tenant activo. Pasos:
//   1. POST /api/auth/switch-tenant — el backend rota la cookie refreshToken
//      y devuelve un nuevo accessToken con activeTenantId actualizado.
//   2. Guardar el nuevo accessToken en el auth-store (el decode del JWT
//      pone activeTenantId y roles del tenant nuevo en el user local).
//   3. Invalidar TODO el cache — la data del tenant anterior no sirve.
//      El próximo render de cualquier página vuelve a pedir con el nuevo
//      Bearer token.
export function useSwitchTenant() {
  const setToken = useAuthStore((s) => s.setToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => switchTenant(tenantId),
    onSuccess: (data) => {
      setToken(data.accessToken);
      // Cache nuclear-reset: data del tenant viejo es inválida.
      void qc.invalidateQueries();
    },
  });
}
