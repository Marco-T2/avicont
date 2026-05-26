import { useAuthStore } from '@/stores/auth-store';
import type { SystemRole } from '@/types/api';

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
