import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

// Marca un endpoint con la lista de permisos requeridos. El PermissionsGuard
// los compara contra los permisos efectivos del user (hasAllPermissions).
// Strings son del catálogo (ver src/common/permisos/catalogo.ts).
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
