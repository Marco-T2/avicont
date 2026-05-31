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
//   4. Invalidar me-permissions explícitamente para forzar re-fetch inmediato
//      sin esperar el staleTime de 5min (aunque la invalidación global ya lo cubre,
//      la explícita es más semántica y garantiza el caso de staleTime largo).
export function useSwitchTenant() {
  const setToken = useAuthStore((s) => s.setToken);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tenantId: string) => switchTenant(tenantId),
    onSuccess: (data) => {
      setToken(data.accessToken);
      // Cache nuclear-reset: data del tenant viejo es inválida.
      // Incluye me-permissions (REQ-FPG-02: permisos stale por cambio de tenant).
      void qc.invalidateQueries();
      // Invalidación explícita de me-permissions como documentación de intención:
      // al cambiar de tenant los permisos DEBEN re-fetchearse antes de cualquier
      // gating de UI. La invalidación global ya la cubre, pero esta hace explícita
      // la dependencia para futuros refactors que ajusten el scope de la global.
      void qc.invalidateQueries({ queryKey: ['me-permissions'] });
    },
  });
}
