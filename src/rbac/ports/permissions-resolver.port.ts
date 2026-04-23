// Permisos resueltos para un usuario en una organización dada.
// Se devuelven en su forma cruda (incluyendo wildcards). El matcher decide
// si un required específico matchea contra alguno de estos.
export interface ResolvedPermissions {
  esOwner: boolean;
  esAdmin: boolean;
  // Patrones tal como están en CustomRole.permissions o ['*'] para system roles.
  wildcards: string[];
}

export const PERMISSIONS_RESOLVER_PORT = Symbol('PERMISSIONS_RESOLVER_PORT');

export interface PermissionsResolverPort {
  // Resuelve los permisos efectivos del usuario dentro de la organización.
  // Devuelve null si el user no es miembro activo.
  resolve(userId: string, organizationId: string): Promise<ResolvedPermissions | null>;
}
