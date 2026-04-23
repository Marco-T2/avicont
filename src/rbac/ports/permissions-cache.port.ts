import { ResolvedPermissions } from './permissions-resolver.port';

export const PERMISSIONS_CACHE_PORT = Symbol('PERMISSIONS_CACHE_PORT');

// Cache de permisos resueltos. La fuente de verdad sigue siendo la BD;
// el cache solo acelera lecturas. Si el cache falla, el sistema degrada
// a consulta directa con log warn.
export interface PermissionsCachePort {
  get(userId: string, organizationId: string): Promise<ResolvedPermissions | null>;
  set(userId: string, organizationId: string, value: ResolvedPermissions): Promise<void>;

  // Invalidaciones explícitas (post-commit de la transacción que disparó el cambio).
  invalidateUser(userId: string, organizationId: string): Promise<void>;
  invalidateUsersByCustomRole(customRoleId: string): Promise<void>;
  invalidateOrganization(organizationId: string): Promise<void>;
}
