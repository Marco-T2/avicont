import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/stores/auth-store';
import type { SystemRole } from '@/types/api';

import { getMePermissions } from './me-permissions';
import { matchesPermission } from './permission-matcher';

// Helpers de autorización en el cliente. NO reemplazan el RBAC del backend
// — son solo hints de UX para ocultar/mostrar acciones que el backend igual
// va a rechazar si el usuario no tiene permiso. La autoridad sigue siendo
// el backend (ver CLAUDE.md §5 defense in depth).

/**
 * `true` si el usuario actual tiene al menos uno de los roles de sistema
 * indicados. El JWT del backend popula `user.roles` con el SystemRole
 * (OWNER/ADMIN) Y opcionalmente el slug del CustomRole asignado al usuario;
 * acá solo nos interesan los SystemRole.
 */
export function useHasSystemRole(roles: SystemRole[]): boolean {
  const userRoles = useAuthStore((s) => s.user?.roles);
  if (!userRoles || roles.length === 0) return false;
  return roles.some((r) => userRoles.includes(r));
}

/**
 * `true` si el usuario puede reabrir un período fiscal. El backend exige
 * rol SystemRole OWNER o ADMIN, NO solo el permiso RBAC — ver
 * `PeriodosFiscalesController.requireOwnerOrAdmin`. Por eso acá chequeamos
 * los SystemRole y no el catálogo de permisos.
 */
export function usePuedeReabrir(): boolean {
  return useHasSystemRole(['OWNER', 'ADMIN']);
}

// Re-export para que las features no tengan que importar desde rutas internas.
export { usePuedeEditarContabilizado } from '@/features/comprobantes/hooks/use-puede-editar-contabilizado';

/**
 * Hook para consultar los permisos efectivos del usuario autenticado en el
 * tenant activo. Usa TanStack Query con cache aislado por `activeTenantId`
 * (D-F1 del design) — al cambiar de tenant la query key cambia y se refetcha.
 *
 * `has(permission)` implementa fail-closed:
 *   - Sin data (loading/error) → false
 *   - isOwner true → true para cualquier permiso
 *   - Si no → matching de wildcards (matchesPermission), NO Array.includes()
 *
 * El archivo existente (useHasSystemRole, usePuedeReabrir) NO se toca:
 * esos hooks leen SystemRole del JWT (sincrónico), fuente distinta.
 */
export function usePermissions() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeTenantId = useAuthStore((s) => s.user?.activeTenantId);

  const query = useQuery({
    queryKey: ['me-permissions', activeTenantId],
    queryFn: getMePermissions,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // Deshabilitada si no hay token o no hay tenant activo.
    // Esto evita el 403 de /me/permissions durante el bootstrap/switch.
    enabled: Boolean(accessToken) && Boolean(activeTenantId),
  });

  const has = (permission: string): boolean => {
    const data = query.data;
    // fail-closed: sin data → false (nunca muestra acción que daría 403)
    if (data === undefined) return false;
    // owner/admin → acceso total
    if (data.isOwner) return true;
    // matching de wildcards — NUNCA includes() directo (los permisos son patrones)
    return data.permissions.some((w) => matchesPermission(w, permission));
  };

  // AND de varios permisos: espeja el `hasAllPermissions` del backend
  // (permissions.guard.ts) — un endpoint con `@RequirePermissions('a','b')`
  // exige AMBOS. Acá NO hay variante OR a propósito: el backend tampoco la
  // tiene para permisos finos. fail-closed via `has`. `[]` → true (sin gate).
  const hasAll = (permissions: string[]): boolean => permissions.every(has);

  return {
    ...query,
    has,
    hasAll,
    isOwner: query.data?.isOwner ?? false,
    permissions: query.data?.permissions ?? [],
  };
}
