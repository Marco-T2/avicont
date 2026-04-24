/**
 * Superficie cross-módulo que el módulo `rbac` expone a otros módulos
 * que mutan estado relacionado con permisos (roles de membresía,
 * custom-roles, invitaciones aceptadas) y necesitan invalidar el
 * cache de permisos post-commit.
 *
 * Responde a `§1.2` de `docs/deudas-arquitecturales.md`: antes, los
 * 3 callers (`memberships`, `invitations`, `custom-roles`) inyectaban
 * `RbacService` concreto — cualquier cambio en RBAC rompía a los 3.
 * Con este port, cada caller depende sólo del contrato mínimo que usa.
 *
 * Superficie intencionalmente mínima: sólo los métodos consumidos hoy.
 * `invalidateOrganization` existe en `RbacService` pero no se expone acá
 * porque ningún caller externo lo usa (regla §3.7 CLAUDE.md core).
 */

export abstract class PermissionsCacheInvalidationPort {
  /**
   * Invalida el cache de permisos del par (user, organization).
   * Llamar POST-COMMIT — no dentro de una transacción, porque si la
   * TX luego rollbackea el cache queda sucio.
   */
  abstract invalidateUser(userId: string, organizationId: string): Promise<void>;

  /**
   * Invalida el cache para TODOS los usuarios que tengan asignado
   * este custom role — cambiar los permisos del role requiere
   * propagarlos. Llamar POST-COMMIT.
   */
  abstract invalidateUsersByCustomRole(customRoleId: string): Promise<void>;
}

export const PERMISSIONS_CACHE_INVALIDATION_PORT = Symbol(
  'PERMISSIONS_CACHE_INVALIDATION_PORT',
);
